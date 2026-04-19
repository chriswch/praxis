import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "../state/store.js";
import { getAllAdapters } from "../adapters/index.js";
import { resolvePraxisPaths } from "../state/paths.js";
import {
  buildInstructionSurfaceManifest,
  selectInstructionSurfaces,
} from "../workers/context-manifest.js";
import { EXIT_CODE } from "../../cli/exit-codes.js";
import {
  validateCampaignRecord,
  validateCampaignLedgerRecord,
  validateGapAssessmentResult,
  validateRemediationMapRecord,
} from "../../contracts/validators.js";
import type {
  AdapterName,
  CampaignLedgerRecord,
  CampaignRecord,
  GapAssessmentResult,
  RemediationMapRecord,
} from "../../contracts/model.js";
import { readJsonFileIfExists } from "../state/store.js";

export interface DoctorReport {
  repo_root: string;
  runtime: {
    node: string;
    platform: string;
    praxis_dir_exists: boolean;
    repo_is_git: boolean;
    instruction_surfaces: ReturnType<typeof buildInstructionSurfaceManifest>;
  };
  adapters: {
    adapter: string;
    healthy: boolean;
    supports_resume: boolean;
    reason: string;
    binary: string | null;
    version: string | null;
    instruction_surfaces_found: string[];
    plugin_commands_discoverable: boolean;
    plugin_commands_reason: string;
    plugin_skills_discoverable: boolean;
    plugin_skills_reason: string;
  }[];
  recoverability: {
    has_run_manifest: boolean;
    has_event_log: boolean;
    has_dispatch_directory: boolean;
    has_session_directory: boolean;
    has_worktree_directory: boolean;
    integrity: "healthy" | "warning";
  };
  campaign?: {
    present: boolean;
    reason: string;
    target_spec_present: boolean;
    gap_md_present: boolean;
    gap_json_valid: boolean;
    gap_json_reason: string;
    remediation_map_md_present: boolean;
    remediation_map_json_valid: boolean;
    remediation_map_json_reason: string;
    campaign_valid: boolean;
    campaign_reason: string;
    ledger_valid: boolean;
    ledger_reason: string;
  };
  summary: {
    healthy: boolean;
    exit_code: number;
    reasons: string[];
  };
}

export async function buildDoctorReport(repoRoot: string): Promise<DoctorReport> {
  const paths = resolvePraxisPaths(repoRoot);
  const instructionSurfaces = buildInstructionSurfaceManifest(repoRoot);

  const adapters = await Promise.all(
    getAllAdapters().map(async (adapter) => {
      const health = await adapter.health();
      const pluginCommands = await probePluginCommands(repoRoot, health.adapter);
      const pluginSkills = await probePluginSkills(repoRoot, health.adapter);
      return {
        adapter: health.adapter,
        healthy: health.healthy,
        supports_resume: health.supports_resume,
        reason: health.reason,
        binary: health.binary,
        version: health.version,
        instruction_surfaces_found: selectInstructionSurfaces(
          instructionSurfaces,
          health.adapter,
        ).map((surface) => surface.path),
        plugin_commands_discoverable: pluginCommands.ok,
        plugin_commands_reason: pluginCommands.reason,
        plugin_skills_discoverable: pluginSkills.ok,
        plugin_skills_reason: pluginSkills.reason,
      };
    }),
  );

  const [
    praxisDirExists,
    hasRunManifest,
    hasEventLog,
    hasDispatchDirectory,
    hasSessionDirectory,
    hasWorktreeDirectory,
    repoIsGit,
  ] = await Promise.all([
    exists(paths.praxisDir),
    exists(paths.runFile),
    exists(paths.eventsFile),
    exists(paths.dispatchesDir),
    exists(paths.sessionsDir),
    exists(paths.worktreesDir),
    exists(`${repoRoot}/.git`),
  ]);

  const integrity =
    !praxisDirExists ||
    (hasDispatchDirectory &&
      hasSessionDirectory &&
      hasWorktreeDirectory &&
      (hasRunManifest || hasEventLog))
      ? "healthy"
      : "warning";

  const campaignReport = praxisDirExists ? await buildCampaignSection(repoRoot) : undefined;

  const reasons = [
    ...adapters
      .filter((adapter) => !adapter.healthy)
      .map((adapter) => `${adapter.adapter}: ${adapter.reason}`),
    ...adapters
      .filter((adapter) => adapter.healthy && !adapter.plugin_commands_discoverable)
      .map((adapter) => `${adapter.adapter}: ${adapter.plugin_commands_reason}`),
    ...adapters
      .filter((adapter) => adapter.healthy && !adapter.plugin_skills_discoverable)
      .map((adapter) => `${adapter.adapter}: ${adapter.plugin_skills_reason}`),
    ...(integrity === "warning"
      ? ["runtime_integrity: .praxis layout is incomplete for durable recovery."]
      : []),
    ...(campaignReport?.present ? buildCampaignReasons(campaignReport) : []),
  ];
  const healthy = reasons.length === 0;

  return {
    repo_root: repoRoot,
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      praxis_dir_exists: praxisDirExists,
      repo_is_git: repoIsGit,
      instruction_surfaces: instructionSurfaces,
    },
    adapters,
    recoverability: {
      has_run_manifest: hasRunManifest,
      has_event_log: hasEventLog,
      has_dispatch_directory: hasDispatchDirectory,
      has_session_directory: hasSessionDirectory,
      has_worktree_directory: hasWorktreeDirectory,
      integrity,
    },
    campaign: campaignReport,
    summary: {
      healthy,
      exit_code: healthy ? EXIT_CODE.OK : EXIT_CODE.HEALTH_FAILED,
      reasons,
    },
  };
}

type CampaignSection = NonNullable<DoctorReport["campaign"]>;

async function buildCampaignSection(repoRoot: string): Promise<CampaignSection> {
  const paths = resolvePraxisPaths(repoRoot);
  const campaign = await readJsonFileIfExists<CampaignRecord>(paths.campaignFile);
  if (!campaign) {
    return {
      present: false,
      reason: "no campaign: .praxis/campaign.json not found.",
      target_spec_present: false,
      gap_md_present: false,
      gap_json_valid: false,
      gap_json_reason: "skipped (no campaign)",
      remediation_map_md_present: false,
      remediation_map_json_valid: false,
      remediation_map_json_reason: "skipped (no campaign)",
      campaign_valid: false,
      campaign_reason: "skipped (no campaign)",
      ledger_valid: false,
      ledger_reason: "skipped (no campaign)",
    };
  }

  const campaignValidation = safeValidate(() => {
    validateCampaignRecord(campaign);
  });
  const ledger = await readJsonFileIfExists<CampaignLedgerRecord>(paths.campaignLedgerFile);
  const ledgerValidation = ledger
    ? safeValidate(() => {
        validateCampaignLedgerRecord(ledger);
      })
    : { ok: false, reason: "missing .praxis/campaign-ledger.json" };
  const targetSpecPresent = await exists(paths.targetSpecFile);

  const gap = await readJsonFileIfExists<GapAssessmentResult>(paths.gapDataFile);
  const gapValidation = gap
    ? safeValidate(() => {
        validateGapAssessmentResult(gap);
      })
    : { ok: false, reason: "missing .praxis/gap.json" };
  const gapMdPresent = await exists(paths.gapFile);

  const remediationMap = await readJsonFileIfExists<RemediationMapRecord>(
    paths.remediationMapDataFile,
  );
  const remediationValidation = remediationMap
    ? safeValidate(() => {
        validateRemediationMapRecord(remediationMap);
      })
    : { ok: false, reason: "missing .praxis/remediation-map.json" };
  const remediationMdPresent = await exists(paths.remediationMapFile);

  return {
    present: true,
    reason: `campaign ${campaign.campaign_id} status ${campaign.status}.`,
    target_spec_present: targetSpecPresent,
    gap_md_present: gapMdPresent,
    gap_json_valid: gapValidation.ok,
    gap_json_reason: gapValidation.reason ?? "ok",
    remediation_map_md_present: remediationMdPresent,
    remediation_map_json_valid: remediationValidation.ok,
    remediation_map_json_reason: remediationValidation.reason ?? "ok",
    campaign_valid: campaignValidation.ok,
    campaign_reason: campaignValidation.reason ?? "ok",
    ledger_valid: ledgerValidation.ok,
    ledger_reason: ledgerValidation.reason ?? "ok",
  };
}

function buildCampaignReasons(report: CampaignSection): string[] {
  const reasons: string[] = [];
  if (!report.target_spec_present) {
    reasons.push("campaign_target_spec: .praxis/target-spec.md is missing.");
  }
  if (!report.gap_json_valid) {
    reasons.push(`campaign_gap: ${report.gap_json_reason}`);
  }
  if (!report.remediation_map_json_valid) {
    reasons.push(`campaign_remediation_map: ${report.remediation_map_json_reason}`);
  }
  if (!report.campaign_valid) {
    reasons.push(`campaign_record: ${report.campaign_reason}`);
  }
  if (!report.ledger_valid) {
    reasons.push(`campaign_ledger: ${report.ledger_reason}`);
  }
  return reasons;
}

function safeValidate(validator: () => void): { ok: boolean; reason?: string } {
  try {
    validator();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// Verify the plugin slash commands resolve under the adapter's own plugin
// directory. Claude stores plugin files under `commands/` and skills under
// `skills/` in the repo root (or the plugin dir). We probe for the existence
// of the files Praxis relies on: `commands/craft.md` and `commands/forge.md`
// for the craft surface, and `skills/assessing-gaps/SKILL.md` for the new
// converge assessing-gaps skill.
async function probePluginCommands(
  repoRoot: string,
  adapter: AdapterName,
): Promise<{ ok: boolean; reason: string }> {
  const required = ["commands/craft.md", "commands/forge.md"];
  const missing: string[] = [];
  for (const path of required) {
    const abs = join(resolvePluginRoot(repoRoot, adapter), path);
    if (!(await exists(abs))) {
      missing.push(path);
    }
  }
  if (missing.length === 0) {
    return { ok: true, reason: "ok" };
  }
  return {
    ok: false,
    reason: `missing plugin command files for ${adapter}: ${missing.join(", ")}`,
  };
}

async function probePluginSkills(
  repoRoot: string,
  adapter: AdapterName,
): Promise<{ ok: boolean; reason: string }> {
  const required = [
    "skills/clarifying-intent/SKILL.md",
    "skills/assessing-gaps/SKILL.md",
    "skills/driving-tdd/SKILL.md",
  ];
  const missing: string[] = [];
  for (const path of required) {
    const abs = join(resolvePluginRoot(repoRoot, adapter), path);
    if (!(await exists(abs))) {
      missing.push(path);
    }
  }
  if (missing.length === 0) {
    return { ok: true, reason: "ok" };
  }
  return {
    ok: false,
    reason: `missing plugin skill files for ${adapter}: ${missing.join(", ")}`,
  };
}

// The plugin sits one directory above src/praxis-ts/ (at the repo root).
// When praxis is invoked from the ts package root, resolve back to the
// surrounding plugin directory. Allow env override for unusual layouts.
function resolvePluginRoot(repoRoot: string, adapter: AdapterName): string {
  const override = process.env.PRAXIS_PLUGIN_ROOT?.trim();
  if (override && override.length > 0) {
    return override;
  }
  // Try ../../ first (typical layout: <plugin>/src/praxis-ts/); fall back to
  // repoRoot itself when the repo IS the plugin.
  const candidate = join(repoRoot, "..", "..");
  void adapter;
  return candidate;
}

// Export the probe helpers so adapter tests can validate them independently.
export { probePluginCommands, probePluginSkills, resolvePluginRoot };
void readFile;
