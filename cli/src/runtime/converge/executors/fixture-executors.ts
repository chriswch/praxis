import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type {
  ConvergeProfile,
  GapAssessmentResult,
  GapFinding,
} from "../../../contracts/model.js";
import { buildFindingFingerprint } from "../identity.js";
import { compareSeverity } from "../severity.js";
import { buildConvergeStageResult } from "../stage-runtime.js";
import { formatTargetSpecMarkdown } from "../target-spec-formatter.js";
import type {
  ConvergeStageExecutor,
  ConvergeStageExecutorContext,
  ConvergeStageExecutorOutput,
} from "../stage-executor.js";
import { ConvergeStageExecutorRegistry } from "../stage-executor.js";

// Deterministic, in-process clarifying-intent executor for smoke tests and
// other contexts where the adapter subprocess is not available. Uses the
// legacy lexical target-spec formatter. Production code should use
// AgentClarifyingIntentExecutor instead.
export class FixtureClarifyingIntentExecutor implements ConvergeStageExecutor {
  readonly stage = "clarifying-intent" as const;

  execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput> {
    const draft = formatTargetSpecMarkdown(context.campaign, context.objectiveText);
    const outcomeCode = draft.needsClarification ? "clarification_needed" : "target_spec_ready";
    const stageResult = buildConvergeStageResult({
      stage: "clarifying-intent",
      profile: context.campaign.profile,
      outcomeCode,
      data: {
        clarification_issues: draft.clarificationIssues,
        acceptance_criteria_count: draft.acceptanceCriteriaCount,
        clarification_approval_status: draft.clarificationRecord.approval.status,
      },
    });

    return Promise.resolve({
      stageResult,
      artifactsWritten: [
        ".praxis/target-spec.md",
        ".praxis/clarification.json",
        ".praxis/results/clarifying-intent.json",
      ],
      targetSpecText: draft.markdown,
      needsClarification: draft.needsClarification,
      clarificationIssues: draft.clarificationIssues,
      clarificationRecord: draft.clarificationRecord as unknown as Record<string, unknown>,
    });
  }
}

// Deterministic, in-process assessing-gaps executor for smoke tests. Walks the
// repo, extracts tokens from the target spec, and emits findings for
// requirements with insufficient code coverage. Keeps the legacy behavior so
// existing smoke tests still exercise the orchestration plumbing.
export class FixtureAssessingGapsExecutor implements ConvergeStageExecutor {
  readonly stage = "assessing-gaps" as const;

  async execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput> {
    if (!context.reviewId) {
      throw new Error("Fixture assessing-gaps executor requires a review id.");
    }
    const targetSpecText =
      context.targetSpecText ??
      (await readFile(context.repo.paths.targetSpecFile, "utf8"));
    const gap = await fixtureAssessGaps({
      repoRoot: context.repoRoot,
      profile: context.campaign.profile,
      targetSpecText,
      scope: context.campaign.objective.scope,
      reviewId: context.reviewId,
      generatedAt: context.generatedAt,
    });

    const stageResult = buildConvergeStageResult({
      stage: "assessing-gaps",
      profile: context.campaign.profile,
      reviewId: context.reviewId,
      outcomeCode: gap.findings.length === 0 ? "no_gaps" : "findings_recorded",
      data: {
        findings_count: gap.findings.length,
      },
    });

    const artifactsWritten = await context.repo.saveGapArtifacts({
      gapMarkdown: fixtureFormatGapMarkdown(gap),
      gap,
      stageResult,
    });

    return {
      stageResult,
      artifactsWritten,
      gap,
    };
  }
}

// Simpler fixture assessor: slurps list items from normative sections, emits
// one finding per item with evidence "insufficient code coverage". Sufficient
// for smoke tests that only care about plumbing, not the quality of gaps.
async function fixtureAssessGaps(input: {
  repoRoot: string;
  profile: ConvergeProfile;
  targetSpecText: string;
  scope: string[];
  reviewId: string;
  generatedAt: string;
}): Promise<GapAssessmentResult> {
  const requirements = extractRequirements(input.targetSpecText);
  const repoText = await indexRepoText(input.repoRoot, input.scope);

  const findings: GapFinding[] = requirements.map((requirement, index) => {
    const keywords = extractKeywords(requirement.text);
    const matchedKeywords = keywords.filter((token) => repoText.includes(token));
    const coverage =
      keywords.length === 0 ? 0 : matchedKeywords.length / keywords.length;
    const kind: GapFinding["kind"] = coverage < 0.3 ? "missing" : "partial";
    const severity: GapFinding["severity"] =
      input.profile === "architecture-gap" && /must|required|ensure/i.test(requirement.text)
        ? "high"
        : "medium";
    const finding: GapFinding = {
      finding_id: `G-${String(index + 1).padStart(3, "0")}`,
      fingerprint: "",
      title: `${requirement.section}: objective gap`,
      kind,
      severity,
      category: "objective-alignment",
      summary: `Requirement is not fully implemented: ${requirement.text}`,
      expected_behavior: requirement.text,
      current_behavior: `Observed coverage ${(coverage * 100).toFixed(0)}% for keywords ${keywords.slice(0, 5).join(", ") || "(none)"}.`,
      evidence: [
        `Objective requirement (line ${String(requirement.line)}): ${requirement.text}`,
      ],
      objective_refs: [`${input.reviewId}:${slugify(requirement.section)}`],
      affected_paths: ["src/runtime/converge"],
      recommended_direction: `Align implementation with: ${requirement.text}`,
      recommended_action: `Align implementation with: ${requirement.text}`,
      confidence: 0.7,
    };
    finding.fingerprint = buildFindingFingerprint(input.profile, finding);
    return finding;
  });

  findings.sort((left, right) => {
    const severityOrder = compareSeverity(left.severity, right.severity);
    if (severityOrder !== 0) return severityOrder;
    return left.title.localeCompare(right.title);
  });

  return {
    version: 1,
    profile: input.profile,
    review_id: input.reviewId,
    target_spec_path: ".praxis/target-spec.md",
    findings,
    generated_at: input.generatedAt,
  };
}

function extractRequirements(
  targetSpecText: string,
): { section: string; text: string; line: number }[] {
  const lines = targetSpecText.split(/\r?\n/);
  const reqs: { section: string; text: string; line: number }[] = [];
  let section = "Objective";
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const item = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (!item) continue;
    const statement = item[1].trim();
    if (statement.length < 12) continue;
    if (
      /^(clarification status|references|imported objective content|scope|non-?goals?)$/i.test(
        section,
      )
    ) {
      continue;
    }
    if (!/(acceptance|criteria|requirements?|constraints?|expected behavior|definition of done)/i.test(section)) {
      continue;
    }
    reqs.push({ section, text: statement, line: index + 1 });
  }
  return reqs;
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[`"'():.,]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  return Array.from(new Set(tokens)).slice(0, 10);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function indexRepoText(repoRoot: string, scope: string[]): Promise<string> {
  const excluded = new Set([".git", ".praxis", "node_modules", "dist", "build", "coverage"]);
  const allowed = new Set([".ts", ".js", ".md", ".json"]);
  const stack =
    scope.length > 0
      ? scope.map((item) => join(repoRoot, item))
      : ["src", "README.md"].map((item) => join(repoRoot, item));
  const parts: string[] = [];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const candidate = stack.pop();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);
    let s;
    try {
      s = await stat(candidate);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      const name = candidate.split("/").at(-1) ?? "";
      if (excluded.has(name)) continue;
      const entries = await readdir(candidate, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".plan") continue;
        stack.push(join(candidate, entry.name));
      }
      continue;
    }
    if (!allowed.has(extname(candidate).toLowerCase())) continue;
    try {
      parts.push((await readFile(candidate, "utf8")).toLowerCase());
    } catch {
      // ignore
    }
  }
  return parts.join("\n");
}

function fixtureFormatGapMarkdown(gap: GapAssessmentResult): string {
  const lines: string[] = [
    "# Gap Assessment",
    "",
    "## Assessment Scope",
    "",
    `- Target spec: ${gap.target_spec_path}`,
    `- Profile: ${gap.profile}`,
    `- Findings: ${String(gap.findings.length)}`,
    "",
    "## Ordered Findings",
    "",
  ];
  for (const finding of gap.findings) {
    lines.push(`### ${finding.finding_id} ${finding.title}`);
    lines.push(`- Kind: ${finding.kind}`);
    lines.push(`- Severity: ${finding.severity}`);
    lines.push(`- Confidence: ${String(finding.confidence)}`);
    lines.push(`- Expected behavior: ${finding.expected_behavior}`);
    lines.push(`- Current behavior: ${finding.current_behavior}`);
    lines.push(`- Recommended direction: ${finding.recommended_direction}`);
    lines.push("");
  }
  return lines.join("\n");
}

// Build a registry pinned to deterministic fixture executors. Useful in smoke
// tests or any scenario where a real adapter subprocess is not available.
export function buildFixtureConvergeExecutorRegistry(): ConvergeStageExecutorRegistry {
  return new ConvergeStageExecutorRegistry()
    .register(new FixtureClarifyingIntentExecutor())
    .register(new FixtureAssessingGapsExecutor());
}
