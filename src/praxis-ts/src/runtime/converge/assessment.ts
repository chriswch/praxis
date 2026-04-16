import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ConvergeProfile,
  ObjectiveAssessmentResult,
  ObjectiveFinding
} from "../../contracts/model.js";
import { buildFindingFingerprint } from "./identity.js";
import { compareSeverity } from "./severity.js";
import { exists } from "../state/store.js";

type AssessmentInput = {
  repoRoot: string;
  profile: ConvergeProfile;
  objectivePath: string;
  objectiveText: string;
  scope: string[];
  reviewId: string;
  generatedAt: string;
};

type CheckDefinition = {
  id: string;
  title: string;
  severity: ObjectiveFinding["severity"];
  category: string;
  summary: string;
  recommendedAction: string;
  affectedPaths: string[];
  evidence: string[];
  confidence: number;
  test: (repoRoot: string) => Promise<boolean>;
};

async function fileContains(repoRoot: string, relativePath: string, snippets: string[]): Promise<boolean> {
  const absolutePath = join(repoRoot, relativePath);
  if (!(await exists(absolutePath))) {
    return false;
  }

  const content = await readFile(absolutePath, "utf8");
  return snippets.every((snippet) => content.includes(snippet));
}

function inScope(scope: string[], affectedPaths: string[]): boolean {
  if (scope.length === 0 || affectedPaths.length === 0) {
    return true;
  }

  return affectedPaths.some((path) => scope.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
}

function productSpecChecks(): CheckDefinition[] {
  return [
    {
      id: "cli-converge-family",
      title: "CLI is missing converge command family",
      severity: "critical",
      category: "cli-surface",
      summary: "The public command plane does not expose `praxis converge` with lifecycle subcommands.",
      recommendedAction: "Register a `converge` command group with run/status/inspect/resume/continue/cancel.",
      affectedPaths: ["src/cli/program.ts"],
      evidence: ["Expected subcommands: run,status,inspect,resume,continue,cancel"],
      confidence: 0.98,
      test: async (repoRoot) =>
        fileContains(repoRoot, "src/cli/program.ts", [
          ".command(\"converge\")",
          ".command(\"run\")",
          ".command(\"status\")",
          ".command(\"inspect\")",
          ".command(\"resume\")",
          ".command(\"continue\")",
          ".command(\"cancel\")"
        ])
    },
    {
      id: "cli-command-handlers",
      title: "Converge command handlers are not exported",
      severity: "high",
      category: "cli-surface",
      summary: "Command handlers for converge are not available from the shared command index.",
      recommendedAction: "Add converge command handler modules and export them in src/cli/commands/index.ts.",
      affectedPaths: ["src/cli/commands/index.ts"],
      evidence: ["Expected runConverge*Command exports"],
      confidence: 0.95,
      test: async (repoRoot) =>
        fileContains(repoRoot, "src/cli/commands/index.ts", [
          "runConvergeRunCommand",
          "runConvergeStatusCommand",
          "runConvergeInspectCommand",
          "runConvergeResumeCommand",
          "runConvergeContinueCommand",
          "runConvergeCancelCommand"
        ])
    },
    {
      id: "campaign-runtime-service",
      title: "Campaign runtime service is missing",
      severity: "critical",
      category: "runtime-control",
      summary: "The campaign controller does not exist, so iterative converge routing cannot execute.",
      recommendedAction: "Implement a converge campaign service that owns assessment, batching, remediation linkage, and stop policy.",
      affectedPaths: ["src/runtime/converge/campaign-service.ts"],
      evidence: ["Expected campaign service module under src/runtime/converge"],
      confidence: 0.99,
      test: async (repoRoot) => exists(join(repoRoot, "src/runtime/converge/campaign-service.ts"))
    },
    {
      id: "durable-campaign-artifacts",
      title: "Campaign durable artifact wiring is incomplete",
      severity: "high",
      category: "durable-state",
      summary: "State paths/repository APIs for campaign and findings artifacts are incomplete.",
      recommendedAction: "Wire campaign/objective/ledger/passes/reviews paths and repository save/load helpers.",
      affectedPaths: ["src/runtime/state/paths.ts", "src/runtime/state/repository.ts"],
      evidence: ["Expected campaignFile, campaignLedgerFile, passesDir, reviewsDir and corresponding repository methods"],
      confidence: 0.9,
      test: async (repoRoot) =>
        (await fileContains(repoRoot, "src/runtime/state/paths.ts", [
          "campaignFile",
          "campaignLedgerFile",
          "passesDir",
          "reviewsDir"
        ]))
        && (await fileContains(repoRoot, "src/runtime/state/repository.ts", [
          "loadCampaign",
          "saveCampaign",
          "loadCampaignLedger",
          "saveCampaignLedger",
          "saveReviewArtifacts",
          "savePassBatch",
          "savePassSummary"
        ]))
    },
    {
      id: "assessment-profiles",
      title: "Required assessment profiles are not fully supported",
      severity: "medium",
      category: "assessment",
      summary: "Convergence requires explicit product-spec-gap and architecture-gap profiles.",
      recommendedAction: "Define profile contracts and implement profile-aware assessors.",
      affectedPaths: ["src/contracts/model.ts", "src/runtime/converge/assessment.ts"],
      evidence: ["Expected product-spec-gap and architecture-gap profile support"],
      confidence: 0.85,
      test: async (repoRoot) =>
        (await fileContains(repoRoot, "src/contracts/model.ts", [
          "CONVERGE_PROFILES = [\"product-spec-gap\", \"architecture-gap\"]"
        ]))
        && (await exists(join(repoRoot, "src/runtime/converge/assessment.ts")))
    }
  ];
}

function architectureChecks(): CheckDefinition[] {
  return [
    {
      id: "layered-campaign-runtime",
      title: "Campaign runtime is not isolated from story run control",
      severity: "high",
      category: "architecture",
      summary: "Converge control should live in a dedicated runtime module instead of expanding run-stage control directly.",
      recommendedAction: "Keep campaign orchestration in src/runtime/converge and use run control only for child linkage.",
      affectedPaths: ["src/runtime/converge", "src/runtime/control"],
      evidence: ["Expected dedicated converge runtime module"],
      confidence: 0.82,
      test: async (repoRoot) => exists(join(repoRoot, "src/runtime/converge"))
    },
    {
      id: "campaign-ledger-contract",
      title: "Campaign findings ledger contract is missing",
      severity: "critical",
      category: "architecture",
      summary: "Without a campaign findings ledger, converge cannot route passes from durable state.",
      recommendedAction: "Add campaign-ledger contract with stable finding IDs and pass linkage.",
      affectedPaths: ["src/contracts/model.ts", "src/contracts/validators.ts"],
      evidence: ["Expected CampaignLedgerRecord with finding_id/fingerprint/status/pass linkage"],
      confidence: 0.95,
      test: async (repoRoot) =>
        (await fileContains(repoRoot, "src/contracts/model.ts", ["export type CampaignLedgerRecord"])) &&
        (await fileContains(repoRoot, "src/contracts/validators.ts", ["validateCampaignLedgerRecord"]))
    },
    {
      id: "bounded-stop-policy",
      title: "Convergence stop policy is not implemented",
      severity: "medium",
      category: "architecture",
      summary: "Campaign decisions must stop on convergence, stall, block, or budget limits.",
      recommendedAction: "Implement stop reason codes and route decisions in campaign runtime.",
      affectedPaths: ["src/contracts/model.ts", "src/runtime/converge/campaign-service.ts"],
      evidence: ["Expected campaign stop reason codes and enforcement in runtime"],
      confidence: 0.8,
      test: async (repoRoot) =>
        (await fileContains(repoRoot, "src/contracts/model.ts", ["CAMPAIGN_STOP_REASON_CODES"])) &&
        (await fileContains(repoRoot, "src/runtime/converge/campaign-service.ts", ["budget_exhausted", "stalled"]))
    }
  ];
}

function objectiveRefsFromText(objectivePath: string, objectiveText: string): string[] {
  const refs = [objectivePath];
  if (objectiveText.includes("Acceptance Criteria")) {
    refs.push(`${objectivePath}#acceptance-criteria`);
  }
  if (objectiveText.includes("New Public CLI Surface")) {
    refs.push(`${objectivePath}#new-public-cli-surface`);
  }
  return refs;
}

export async function assessObjective(input: AssessmentInput): Promise<{
  assessmentMarkdown: string;
  assessment: ObjectiveAssessmentResult;
}> {
  const checks = input.profile === "product-spec-gap" ? productSpecChecks() : architectureChecks();
  const findings: ObjectiveFinding[] = [];

  for (const check of checks) {
    if (!inScope(input.scope, check.affectedPaths)) {
      continue;
    }
    if (await check.test(input.repoRoot)) {
      continue;
    }

    const objectiveFinding: ObjectiveFinding = {
      fingerprint: "",
      title: check.title,
      severity: check.severity,
      category: check.category,
      summary: check.summary,
      evidence: check.evidence,
      objective_refs: objectiveRefsFromText(input.objectivePath, input.objectiveText),
      affected_paths: check.affectedPaths,
      recommended_action: check.recommendedAction,
      confidence: check.confidence
    };
    objectiveFinding.fingerprint = buildFindingFingerprint(input.profile, objectiveFinding);
    findings.push(objectiveFinding);
  }

  findings.sort((left, right) => {
    const severityOrder = compareSeverity(left.severity, right.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }
    return left.title.localeCompare(right.title);
  });

  const assessment: ObjectiveAssessmentResult = {
    version: 1,
    profile: input.profile,
    review_id: input.reviewId,
    objective_path: input.objectivePath,
    findings,
    generated_at: input.generatedAt
  };

  const markdownLines: string[] = [
    "# Objective Assessment",
    "",
    `- Profile: ${input.profile}`,
    `- Objective: ${input.objectivePath}`,
    `- Findings: ${findings.length}`,
    "",
    findings.length === 0 ? "No findings at this pass." : "## Findings",
    ""
  ];
  for (const finding of findings) {
    markdownLines.push(`### ${finding.title}`);
    markdownLines.push(`- Severity: ${finding.severity}`);
    markdownLines.push(`- Category: ${finding.category}`);
    markdownLines.push(`- Summary: ${finding.summary}`);
    markdownLines.push(`- Recommended action: ${finding.recommended_action}`);
    markdownLines.push(`- Affected paths: ${finding.affected_paths.join(", ") || "(none)"}`);
    markdownLines.push("");
  }

  return {
    assessmentMarkdown: markdownLines.join("\n"),
    assessment
  };
}
