import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type {
  ConvergeProfile,
  ObjectiveAssessmentResult,
  ObjectiveFinding
} from "../../contracts/model.js";
import { buildFindingFingerprint } from "./identity.js";
import { compareSeverity } from "./severity.js";

type AssessmentInput = {
  repoRoot: string;
  profile: ConvergeProfile;
  objectivePath: string;
  objectiveText: string;
  scope: string[];
  reviewId: string;
  generatedAt: string;
};

type ObjectiveRequirement = {
  section: string;
  text: string;
  objectiveRef: string;
  line: number;
};

type RepoDocument = {
  path: string;
  content: string;
};

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "must",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "without"
]);

const EXCLUDED_DIRS = new Set([".git", ".praxis", "node_modules", "dist", "build", ".next", "coverage"]);
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml"]);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toRepoPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function parseObjectiveRequirements(objectivePath: string, objectiveText: string): ObjectiveRequirement[] {
  const lines = objectiveText.split(/\r?\n/);
  const requirements: ObjectiveRequirement[] = [];
  let section = "Objective";
  let fallbackCount = 0;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    const listItem = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (!listItem) {
      continue;
    }
    const statement = listItem[1].trim();
    if (statement.length < 12) {
      continue;
    }
    const refAnchor = slugify(section) || `line-${index + 1}`;
    requirements.push({
      section,
      text: statement,
      objectiveRef: `${objectivePath}#${refAnchor}`,
      line: index + 1
    });
  }

  if (requirements.length > 0) {
    return requirements;
  }

  for (const [index, sentence] of objectiveText.split(/[.!?]\s+/).entries()) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) {
      continue;
    }
    fallbackCount += 1;
    requirements.push({
      section: "Objective",
      text: trimmed,
      objectiveRef: `${objectivePath}#line-${index + 1}`,
      line: index + 1
    });
    if (fallbackCount >= 12) {
      break;
    }
  }
  return requirements;
}

function extractKeywords(text: string): string[] {
  const fromCodeBlocks = [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim().toLowerCase())
    .flatMap((value) => value.split(/\s+/))
    .filter(Boolean);
  const plainWords = text
    .toLowerCase()
    .replace(/[`"'():.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const ranked = [...fromCodeBlocks, ...plainWords]
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 || token.startsWith("--") || token.includes("/"))
    .filter((token) => !STOPWORDS.has(token));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of ranked) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 14) {
      break;
    }
  }
  return deduped;
}

function classifyCategory(requirement: string): string {
  const lower = requirement.toLowerCase();
  if (lower.includes("cli") || lower.includes("command") || lower.includes("--")) {
    return "cli-surface";
  }
  if (lower.includes("assessment") || lower.includes("objective") || lower.includes("profile")) {
    return "objective-assessment";
  }
  if (lower.includes("ledger") || lower.includes("artifact") || lower.includes("durable")) {
    return "durable-state";
  }
  if (lower.includes("batch") || lower.includes("finding") || lower.includes("story")) {
    return "batch-planning";
  }
  if (lower.includes("child") || lower.includes("scope") || lower.includes("craft")) {
    return "child-remediation";
  }
  if (lower.includes("stop") || lower.includes("stalled") || lower.includes("budget") || lower.includes("converged")) {
    return "stop-policy";
  }
  if (lower.includes("commit")) {
    return "commit-policy";
  }
  return "objective-alignment";
}

function defaultAffectedPathsForCategory(category: string): string[] {
  switch (category) {
    case "cli-surface":
      return ["src/cli"];
    case "objective-assessment":
      return ["src/runtime/converge/assessment.ts"];
    case "durable-state":
      return ["src/runtime/state"];
    case "batch-planning":
      return ["src/runtime/converge/planner.ts"];
    case "child-remediation":
      return ["src/runtime/converge/campaign-service.ts"];
    case "stop-policy":
      return ["src/runtime/converge/campaign-service.ts"];
    case "commit-policy":
      return ["src/runtime/control"];
    default:
      return ["src/runtime/converge"];
  }
}

function inferSeverity(
  profile: ConvergeProfile,
  requirement: string,
  coverage: number
): ObjectiveFinding["severity"] {
  const lower = requirement.toLowerCase();
  const strict = lower.includes("must") || lower.includes("required") || lower.includes("authoritative");
  const foundational =
    lower.includes("assessment")
    || lower.includes("stop")
    || lower.includes("child")
    || lower.includes("command")
    || lower.includes("durable");

  if (strict && foundational && coverage < 0.55) {
    return "critical";
  }
  if ((strict && coverage < 0.72) || (profile === "architecture-gap" && foundational && coverage < 0.75)) {
    return "high";
  }
  if (coverage < 0.85) {
    return "medium";
  }
  return "low";
}

async function listRepoDocuments(repoRoot: string, scope: string[]): Promise<RepoDocument[]> {
  const documents: RepoDocument[] = [];
  const stack = scope.length > 0
    ? scope.map((item) => join(repoRoot, item))
    : [join(repoRoot, "src"), join(repoRoot, "README.md"), join(repoRoot, "product-spec.md"), join(repoRoot, ".plan")];

  const visited = new Set<string>();
  while (stack.length > 0) {
    const candidate = stack.pop();
    if (!candidate || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    let itemStats;
    try {
      itemStats = await stat(candidate);
    } catch {
      continue;
    }

    if (itemStats.isDirectory()) {
      const name = candidate.split("/").at(-1) ?? "";
      if (EXCLUDED_DIRS.has(name)) {
        continue;
      }
      const entries = await readdir(candidate, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".plan") {
          continue;
        }
        stack.push(join(candidate, entry.name));
      }
      continue;
    }

    const extension = extname(candidate).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      continue;
    }

    try {
      const content = await readFile(candidate, "utf8");
      const relativePath = toRepoPath(candidate.replace(`${repoRoot}/`, ""));
      documents.push({
        path: relativePath,
        content: content.toLowerCase()
      });
    } catch {
      // Best effort indexing: unreadable files are ignored.
    }
  }
  return documents;
}

function summarizeEvidence(
  requirement: ObjectiveRequirement,
  matchedTokens: string[],
  keywords: string[],
  topMatches: Array<{ path: string; score: number }>
): string[] {
  const lines = [
    `Objective requirement (line ${requirement.line}): ${requirement.text}`,
    `Keyword coverage: ${matchedTokens.length}/${keywords.length}.`
  ];
  if (topMatches.length > 0) {
    lines.push(
      `Nearest implementation signals: ${topMatches.map((match) => `${match.path} (${match.score})`).join(", ")}.`
    );
  } else {
    lines.push("Nearest implementation signals: none.");
  }
  return lines;
}

function recommendedAction(profile: ConvergeProfile, requirement: ObjectiveRequirement): string {
  if (profile === "architecture-gap") {
    return `Align runtime architecture with objective requirement: ${requirement.text}`;
  }
  return `Implement or tighten product behavior for objective requirement: ${requirement.text}`;
}

function confidenceFromCoverage(coverage: number): number {
  const confidence = 0.55 + ((1 - coverage) * 0.4);
  return Math.max(0.45, Math.min(0.99, Number.parseFloat(confidence.toFixed(2))));
}

function shouldEmitFinding(profile: ConvergeProfile, coverage: number, requirement: string): boolean {
  const strict = /must|required|authoritative|stop|bounded|durable/i.test(requirement);
  const threshold = profile === "architecture-gap" ? 0.72 : 0.78;
  if (strict) {
    return coverage < 0.9;
  }
  return coverage < threshold;
}

export async function assessObjective(input: AssessmentInput): Promise<{
  assessmentMarkdown: string;
  assessment: ObjectiveAssessmentResult;
}> {
  const requirements = parseObjectiveRequirements(input.objectivePath, input.objectiveText);
  const documents = await listRepoDocuments(input.repoRoot, input.scope);
  const findings: ObjectiveFinding[] = [];

  for (const requirement of requirements) {
    const keywords = extractKeywords(requirement.text);
    if (keywords.length === 0) {
      continue;
    }

    const matchedTokens = keywords.filter((token) => documents.some((document) => document.content.includes(token)));
    const coverage = matchedTokens.length / keywords.length;
    if (!shouldEmitFinding(input.profile, coverage, requirement.text)) {
      continue;
    }

    const topMatches = documents
      .map((document) => ({
        path: document.path,
        score: keywords.reduce(
          (count, token) => (document.content.includes(token) ? count + 1 : count),
          0
        )
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const category = classifyCategory(requirement.text);
    const affectedPaths = topMatches.length > 0
      ? topMatches.map((match) => match.path)
      : defaultAffectedPathsForCategory(category);
    const severity = inferSeverity(input.profile, requirement.text, coverage);

    const objectiveFinding: ObjectiveFinding = {
      fingerprint: "",
      title: `${requirement.section}: objective gap`,
      kind: coverage <= 0.2 ? "missing" : "partial",
      severity,
      category,
      summary: `Requirement is not fully implemented: ${requirement.text}`,
      expected_behavior: requirement.text,
      current_behavior: `Repository evidence currently covers ${matchedTokens.length} of ${keywords.length} key terms.`,
      evidence: summarizeEvidence(requirement, matchedTokens, keywords, topMatches),
      objective_refs: [requirement.objectiveRef],
      affected_paths: affectedPaths,
      recommended_direction: recommendedAction(input.profile, requirement),
      recommended_action: recommendedAction(input.profile, requirement),
      confidence: confidenceFromCoverage(coverage)
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
    target_spec_path: input.objectivePath,
    findings,
    generated_at: input.generatedAt
  };

  const markdownLines: string[] = [
    "# Objective Assessment",
    "",
    `- Profile: ${input.profile}`,
    `- Objective: ${input.objectivePath}`,
    `- Requirements analyzed: ${requirements.length}`,
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
