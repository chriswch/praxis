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
