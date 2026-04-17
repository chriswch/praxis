import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { ConvergeProfile, GapAssessmentResult, GapFinding } from "../../contracts/model.js";
import { buildFindingFingerprint } from "./identity.js";
import { compareSeverity } from "./severity.js";

interface AssessmentInput {
  repoRoot: string;
  profile: ConvergeProfile;
  targetSpecPath: string;
  targetSpecText: string;
  scope: string[];
  reviewId: string;
  generatedAt: string;
}

interface ObjectiveRequirement {
  section: string;
  text: string;
  objectiveRef: string;
  line: number;
}

interface RepoDocument {
  path: string;
  text: string;
  lower: string;
  source: "code" | "docs" | "config";
}

interface RequirementSignals {
  keywords: string[];
  literals: string[];
  forbiddenTerms: string[];
  behaviorActions: string[];
  behaviorEntities: string[];
  behaviorPhrases: string[];
  strict: boolean;
  foundational: boolean;
}

interface DocumentMatch {
  path: string;
  source: RepoDocument["source"];
  matchedKeywords: string[];
  matchedLiterals: string[];
  score: number;
  snippets: string[];
}

interface BehaviorProbe {
  path: string;
  line: number;
  statement: string;
  matchedActions: string[];
  matchedEntities: string[];
  matchedPhrases: string[];
  contradictionMarkers: string[];
  score: number;
}

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
  "without",
]);

const ACTION_VERB_ROOTS = [
  "enforce",
  "persist",
  "record",
  "write",
  "read",
  "save",
  "load",
  "validate",
  "reject",
  "allow",
  "block",
  "route",
  "assess",
  "plan",
  "select",
  "group",
  "launch",
  "checkpoint",
  "reassess",
  "commit",
  "resume",
  "pause",
  "derive",
  "generate",
  "emit",
  "capture",
  "store",
  "synchronize",
  "activate",
];

const CONTRADICTION_MARKERS: { label: string; pattern: RegExp }[] = [
  { label: "todo", pattern: /\btodo\b/ },
  { label: "not_implemented", pattern: /not implemented/ },
  { label: "placeholder", pattern: /\bplaceholder\b/ },
  { label: "stub", pattern: /\bstub\b/ },
  {
    label: "throw_unimplemented",
    pattern: /throw\s+new\s+error\([^)]*(not implemented|todo|stub)/,
  },
  { label: "disabled_path", pattern: /\b(skip|disabled|noop)\b/ },
];

const EXCLUDED_DIRS = new Set([
  ".git",
  ".praxis",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
]);
const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

export const DEFAULT_ASSESSMENT_SCOPE: readonly string[] = [
  "src",
  "README.md",
  "product-spec.md",
] as const;
const NORMATIVE_SECTION_PATTERNS = [
  /\bacceptance\b/,
  /\bcriteria\b/,
  /\brequirements?\b/,
  /\bconstraints?\b/,
  /\bexpected behavior\b/,
  /\bdefinition of done\b/,
];
const NON_NORMATIVE_SECTION_PATTERNS = [
  /\bgoal\b/,
  /\bscope\b/,
  /\bnon-?goals?\b/,
  /\bclarification status\b/,
  /\breferences?\b/,
  /\bimported objective content\b/,
];

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

function sectionIsNormative(section: string): boolean {
  const normalized = section.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }
  if (NON_NORMATIVE_SECTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return NORMATIVE_SECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function parseObjectiveRequirements(
  targetSpecPath: string,
  targetSpecText: string,
): ObjectiveRequirement[] {
  const lines = targetSpecText.split(/\r?\n/);
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
    if (!sectionIsNormative(section)) {
      continue;
    }

    const refAnchor = slugify(section) || `line-${String(index + 1)}`;
    requirements.push({
      section,
      text: statement,
      objectiveRef: `${targetSpecPath}#${refAnchor}`,
      line: index + 1,
    });
  }

  if (requirements.length > 0) {
    return requirements;
  }

  // Fallback: if no normative headings are present, consider list items from
  // any section except clearly non-normative sections.
  section = "Objective";
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

    if (NON_NORMATIVE_SECTION_PATTERNS.some((pattern) => pattern.test(section.toLowerCase()))) {
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
    const refAnchor = slugify(section) || `line-${String(index + 1)}`;
    requirements.push({
      section,
      text: statement,
      objectiveRef: `${targetSpecPath}#${refAnchor}`,
      line: index + 1,
    });
  }

  if (requirements.length > 0) {
    return requirements;
  }

  for (const [index, sentence] of targetSpecText.split(/[.!?]\s+/).entries()) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) {
      continue;
    }

    fallbackCount += 1;
    requirements.push({
      section: "Objective",
      text: trimmed,
      objectiveRef: `${targetSpecPath}#line-${String(index + 1)}`,
      line: index + 1,
    });
    if (fallbackCount >= 12) {
      break;
    }
  }

  return requirements;
}

function splitTerms(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[`"'():.,]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractKeywords(text: string): string[] {
  const codeTerms = [...text.matchAll(/`([^`]+)`/g)].map((match) => splitTerms(match[1])).flat();
  const plainWords = splitTerms(text);
  const ranked = [...codeTerms, ...plainWords]
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
    if (deduped.length >= 16) {
      break;
    }
  }
  return deduped;
}

function extractLiterals(text: string): string[] {
  const literals = [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((value) => value.length >= 3)
    .slice(0, 8);
  return Array.from(new Set(literals));
}

function extractForbiddenTerms(text: string): string[] {
  const lower = text.toLowerCase();
  const candidates: string[] = [];
  const pattern =
    /(?:without|remove|drop|deprecate|legacy|no longer|must not|should not|do not)\s+`?([a-z0-9._/-]{3,})`?/g;
  for (const match of lower.matchAll(pattern)) {
    const term = match[1].trim();
    if (term && term.length >= 3) {
      candidates.push(term);
    }
  }
  if (/(?:remove|deprecate|legacy|no longer)/.test(lower)) {
    for (const literal of extractLiterals(text)) {
      candidates.push(literal);
    }
  }
  return Array.from(new Set(candidates));
}

function looksLikeActionToken(token: string): boolean {
  if (ACTION_VERB_ROOTS.some((root) => token.startsWith(root) || root.startsWith(token))) {
    return true;
  }
  return /(ing|ed|ize|ise|ate)$/.test(token) && token.length >= 6;
}

function extractBehaviorActions(text: string): string[] {
  const tokens = splitTerms(text).filter((token) => token.length >= 3);
  const extracted = tokens.filter((token) => looksLikeActionToken(token));
  const fromModal = [
    ...text
      .toLowerCase()
      .matchAll(/\b(?:must|should|shall|ensure|verify|confirm)\s+([a-z0-9_-]{3,})/g),
  ].map((match) => match[1]);
  const combined = Array.from(new Set([...fromModal, ...extracted])).filter(
    (token) => !STOPWORDS.has(token),
  );
  return combined.slice(0, 10);
}

function extractBehaviorEntities(text: string, actions: string[]): string[] {
  const actionSet = new Set(actions);
  const entities = extractKeywords(text)
    .filter((token) => !actionSet.has(token))
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));
  return entities.slice(0, 12);
}

function extractBehaviorPhrases(text: string): string[] {
  const phrases = extractLiterals(text).filter(
    (literal) => literal.includes("/") || literal.includes(".") || literal.startsWith("--"),
  );
  return phrases.slice(0, 8);
}

function classifyCategory(requirement: string): string {
  const lower = requirement.toLowerCase();
  if (lower.includes("cli") || lower.includes("command") || lower.includes("--")) {
    return "cli-surface";
  }
  if (lower.includes("assessment") || lower.includes("target") || lower.includes("profile")) {
    return "gap-assessment";
  }
  if (
    lower.includes("ledger") ||
    lower.includes("artifact") ||
    lower.includes("durable") ||
    lower.includes("history")
  ) {
    return "durable-state";
  }
  if (
    lower.includes("batch") ||
    lower.includes("finding") ||
    lower.includes("story") ||
    lower.includes("slice")
  ) {
    return "batch-planning";
  }
  if (lower.includes("child") || lower.includes("scope") || lower.includes("craft")) {
    return "child-remediation";
  }
  if (
    lower.includes("stop") ||
    lower.includes("stalled") ||
    lower.includes("budget") ||
    lower.includes("converged")
  ) {
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
    case "gap-assessment":
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

function buildSignals(requirement: string): RequirementSignals {
  const lower = requirement.toLowerCase();
  const behaviorActions = extractBehaviorActions(requirement);
  const behaviorEntities = extractBehaviorEntities(requirement, behaviorActions);
  const strict = /\b(must|required|authoritative|shall)\b/.test(lower);
  const foundational =
    lower.includes("assessment") ||
    lower.includes("stop") ||
    lower.includes("child") ||
    lower.includes("command") ||
    lower.includes("durable") ||
    lower.includes("routing") ||
    lower.includes("contract") ||
    lower.includes("history");
  return {
    keywords: extractKeywords(requirement),
    literals: extractLiterals(requirement),
    forbiddenTerms: extractForbiddenTerms(requirement),
    behaviorActions,
    behaviorEntities,
    behaviorPhrases: extractBehaviorPhrases(requirement),
    strict,
    foundational,
  };
}

function inferSeverity(
  profile: ConvergeProfile,
  signals: RequirementSignals,
  kind: GapFinding["kind"],
  codeCoverage: number,
): GapFinding["severity"] {
  if (kind === "wrong") {
    if (signals.strict || signals.foundational) {
      return "critical";
    }
    return "high";
  }

  if (kind === "missing") {
    if (signals.strict && signals.foundational) {
      return "critical";
    }
    if (signals.strict || (profile === "architecture-gap" && signals.foundational)) {
      return "high";
    }
    return "medium";
  }

  if (signals.strict && codeCoverage < 0.55) {
    return "high";
  }
  if (codeCoverage < 0.75 || (profile === "architecture-gap" && signals.foundational)) {
    return "medium";
  }
  return "low";
}

async function listRepoDocuments(repoRoot: string, scope: string[]): Promise<RepoDocument[]> {
  const documents: RepoDocument[] = [];
  const includePlanDocsByScope = scope.some((item) => {
    const normalized = toRepoPath(item);
    return normalized === ".plan" || normalized.startsWith(".plan/");
  });

  const stack =
    scope.length > 0
      ? scope.map((item) => join(repoRoot, item))
      : DEFAULT_ASSESSMENT_SCOPE.map((item) => join(repoRoot, item));

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
        if (entry.name === ".plan" && !includePlanDocsByScope) {
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
      const text = await readFile(candidate, "utf8");
      const relativePath = toRepoPath(candidate.replace(`${repoRoot}/`, ""));
      const source: RepoDocument["source"] = CODE_EXTENSIONS.has(extension)
        ? "code"
        : extension === ".md"
          ? "docs"
          : "config";
      documents.push({
        path: relativePath,
        text,
        lower: text.toLowerCase(),
        source,
      });
    } catch {
      // Best effort indexing: unreadable files are ignored.
    }
  }

  return documents;
}

function collectSnippets(document: RepoDocument, tokens: string[]): string[] {
  if (document.source !== "code" || tokens.length === 0) {
    return [];
  }

  const lines = document.text.split(/\r?\n/);
  const scored = lines
    .map((line, index) => {
      const lower = line.toLowerCase();
      const score = tokens.reduce((count, token) => (lower.includes(token) ? count + 1 : count), 0);
      return {
        line: index + 1,
        text: line.trim(),
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.line - right.line;
    })
    .slice(0, 2);

  return scored.map((entry) => {
    const snippet = entry.text.length > 120 ? `${entry.text.slice(0, 117)}...` : entry.text;
    return `${document.path}:${String(entry.line)} ${snippet}`;
  });
}

function lineIncludesToken(lineLower: string, token: string): boolean {
  if (token.includes("/") || token.includes(".") || token.startsWith("--")) {
    return lineLower.includes(token);
  }
  return new RegExp(`\\b${escapeRegex(token)}\\b`).test(lineLower);
}

function findContradictionMarkers(lineLower: string): string[] {
  return CONTRADICTION_MARKERS.filter((entry) => entry.pattern.test(lineLower)).map(
    (entry) => entry.label,
  );
}

function collectBehaviorProbes(
  document: RepoDocument,
  signals: RequirementSignals,
): BehaviorProbe[] {
  if (document.source !== "code") {
    return [];
  }

  const lines = document.text.split(/\r?\n/);
  const probes: BehaviorProbe[] = [];
  for (const [index, rawLine] of lines.entries()) {
    const statement = rawLine.trim();
    if (statement.length < 4) {
      continue;
    }
    if (statement.startsWith("//") || statement.startsWith("*") || statement.startsWith("/*")) {
      continue;
    }

    const lower = statement.toLowerCase();
    const matchedActions = signals.behaviorActions.filter((token) =>
      lineIncludesToken(lower, token),
    );
    const matchedEntities = signals.behaviorEntities.filter((token) =>
      lineIncludesToken(lower, token),
    );
    const matchedPhrases = signals.behaviorPhrases.filter((phrase) =>
      lineIncludesToken(lower, phrase),
    );

    if (
      matchedActions.length === 0 &&
      matchedEntities.length === 0 &&
      matchedPhrases.length === 0
    ) {
      continue;
    }

    const executableShape =
      /\b(if|switch|case|for|while|return|throw|await|new|function|class|const|let|var|export|import)\b|=>|\w+\(/.test(
        statement,
      );
    if (!executableShape && matchedPhrases.length === 0) {
      continue;
    }

    const contradictionMarkers = findContradictionMarkers(lower);
    const score = Number.parseFloat(
      (
        matchedActions.length * 0.5 +
        matchedEntities.length * 0.35 +
        matchedPhrases.length * 0.25 +
        (executableShape ? 0.2 : 0) -
        (contradictionMarkers.length > 0 ? 0.15 : 0)
      ).toFixed(2),
    );
    if (score < 0.45) {
      continue;
    }

    probes.push({
      path: document.path,
      line: index + 1,
      statement: statement.length > 160 ? `${statement.slice(0, 157)}...` : statement,
      matchedActions,
      matchedEntities,
      matchedPhrases,
      contradictionMarkers,
      score,
    });
  }

  return probes
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.path !== right.path) {
        return left.path.localeCompare(right.path);
      }
      return left.line - right.line;
    })
    .slice(0, 8);
}

function matchDocument(document: RepoDocument, signals: RequirementSignals): DocumentMatch | null {
  const matchedKeywords = signals.keywords.filter((token) => document.lower.includes(token));
  const matchedLiterals = signals.literals.filter((literal) => document.lower.includes(literal));
  if (matchedKeywords.length === 0 && matchedLiterals.length === 0) {
    return null;
  }

  const keywordScore =
    signals.keywords.length > 0 ? matchedKeywords.length / signals.keywords.length : 0;
  const literalScore =
    signals.literals.length > 0 ? matchedLiterals.length / signals.literals.length : 0;
  const sourceBonus = document.source === "code" ? 0.1 : 0;
  const score = Math.min(1, keywordScore * 0.7 + literalScore * 0.3 + sourceBonus);

  return {
    path: document.path,
    source: document.source,
    matchedKeywords,
    matchedLiterals,
    score,
    snippets: collectSnippets(document, [...matchedKeywords, ...matchedLiterals]),
  };
}

function detectContradiction(
  signals: RequirementSignals,
  behaviorProbes: BehaviorProbe[],
  codeMatches: DocumentMatch[],
): { hasConflict: boolean; terms: string[] } {
  const contradictoryMarkers = Array.from(
    new Set(behaviorProbes.flatMap((probe) => probe.contradictionMarkers)),
  );

  const forbiddenFromBehavior = signals.forbiddenTerms.filter((term) =>
    behaviorProbes.some((probe) => lineIncludesToken(probe.statement.toLowerCase(), term)),
  );

  const forbiddenFromSnippets = signals.forbiddenTerms.filter((term) =>
    codeMatches.some((match) =>
      match.snippets.some((snippet) => {
        const lower = snippet.toLowerCase();
        if (!lower.includes(term)) {
          return false;
        }
        const escapedTerm = escapeRegex(term);
        return (
          new RegExp(
            `\\b(import|from|require|new|extends|implements|class|function|const|let|var|type|interface)\\b[^\\n]*\\b${escapedTerm}\\b`,
          ).test(lower) || new RegExp(`\\b${escapedTerm}\\b\\s*(\\(|\\.|:)`).test(lower)
        );
      }),
    ),
  );

  const conflictingTerms = Array.from(
    new Set([...forbiddenFromBehavior, ...forbiddenFromSnippets, ...contradictoryMarkers]),
  );

  return {
    hasConflict: conflictingTerms.length > 0,
    terms: conflictingTerms,
  };
}

function inferConfidence(
  kind: GapFinding["kind"],
  contradiction: boolean,
  codeCoverage: number,
  nonCodeCoverage: number,
): number {
  if (contradiction) {
    return 0.88;
  }

  if (kind === "missing") {
    const base = 0.66 + nonCodeCoverage * 0.2;
    return Math.max(0.5, Math.min(0.9, Number.parseFloat(base.toFixed(2))));
  }

  const base = 0.58 + Math.max(codeCoverage, nonCodeCoverage) * 0.28;
  return Math.max(0.45, Math.min(0.9, Number.parseFloat(base.toFixed(2))));
}

function summarizeCurrentBehavior(
  requirement: ObjectiveRequirement,
  codeCoverage: number,
  nonCodeCoverage: number,
  behaviorProbes: BehaviorProbe[],
  matchedNonCodeTerms: string[],
  uncoveredBehaviorTerms: string[],
  contradiction: { hasConflict: boolean; terms: string[] },
): string {
  if (contradiction.hasConflict) {
    const snippets = behaviorProbes
      .slice(0, 2)
      .map((probe) => `${probe.path}:${String(probe.line)} ${probe.statement}`);
    return [
      `Observed behavior still conflicts with required semantics (${contradiction.terms.join(", ")}).`,
      snippets.length > 0
        ? `Evidence: ${snippets.join(" | ")}`
        : "Evidence appears in sampled in-scope code surfaces.",
    ].join(" ");
  }

  if (behaviorProbes.length === 0) {
    return [
      `No in-scope executable behavior evidence was found for requirement line ${String(requirement.line)}.`,
      `Non-code sources matched ${String(matchedNonCodeTerms.length)} term(s) (${String(Math.round(nonCodeCoverage * 100))}% coverage), which is insufficient for closure.`,
    ].join(" ");
  }

  const topPaths = Array.from(new Set(behaviorProbes.slice(0, 3).map((probe) => probe.path)));
  const snippets = behaviorProbes
    .slice(0, 3)
    .map((probe) => `${probe.path}:${String(probe.line)} ${probe.statement}`);
  const uncovered =
    uncoveredBehaviorTerms.length > 0
      ? `Observed behavior remains partial; missing behavior signals for ${uncoveredBehaviorTerms.slice(0, 6).join(", ")}.`
      : "Observed behavior probes cover the extracted requirement actions and entities.";

  return [
    `Observed executable behavior evidence in ${topPaths.join(", ")}.`,
    snippets.length > 0
      ? `Representative behavior probes: ${snippets.join(" | ")}`
      : "Representative probes were not captured for this requirement.",
    uncovered,
  ].join(" ");
}

function summarizeEvidence(
  requirement: ObjectiveRequirement,
  codeCoverage: number,
  nonCodeCoverage: number,
  matchedBehaviorActions: string[],
  matchedBehaviorEntities: string[],
  matchedNonCodeTerms: string[],
  behaviorProbes: BehaviorProbe[],
  codeMatches: DocumentMatch[],
  nonCodeMatches: DocumentMatch[],
): string[] {
  const lines: string[] = [
    `Objective requirement (line ${String(requirement.line)}): ${requirement.text}`,
    `Coverage summary: behavior=${String(Math.round(codeCoverage * 100))}%, non-code=${String(Math.round(nonCodeCoverage * 100))}%.`,
    `Observed behavior actions: ${matchedBehaviorActions.length > 0 ? matchedBehaviorActions.slice(0, 10).join(", ") : "(none)"}.`,
    `Observed behavior entities: ${matchedBehaviorEntities.length > 0 ? matchedBehaviorEntities.slice(0, 10).join(", ") : "(none)"}.`,
  ];

  if (behaviorProbes.length === 0) {
    lines.push(
      "Executable behavior probes were not found; non-code sources are insufficient for closure.",
    );
  }

  const probes = behaviorProbes
    .slice(0, 2)
    .map((probe) => `${probe.path}:${String(probe.line)} ${probe.statement}`)
    .slice(0, 4);
  if (probes.length > 0) {
    lines.push(`Observed behavior probes: ${probes.join(" | ")}`);
  }

  if (probes.length === 0) {
    const lexicalSnippets = codeMatches
      .slice(0, 2)
      .flatMap((match) => match.snippets)
      .slice(0, 3);
    if (lexicalSnippets.length > 0) {
      lines.push(`Supporting lexical snippets (non-closure): ${lexicalSnippets.join(" | ")}`);
    }
  }

  if (matchedNonCodeTerms.length > 0) {
    const sources = nonCodeMatches
      .filter((match) => !match.path.startsWith(".plan/"))
      .slice(0, 2)
      .map((match) => match.path)
      .join(", ");
    if (sources.length > 0) {
      lines.push(`Non-code signals observed in: ${sources}.`);
    }
  }

  return lines;
}

function recommendedAction(profile: ConvergeProfile, requirement: ObjectiveRequirement): string {
  if (profile === "architecture-gap") {
    return `Align runtime architecture with objective requirement: ${requirement.text}`;
  }
  return `Implement or tighten product behavior for objective requirement: ${requirement.text}`;
}

function shouldEmitFinding(
  profile: ConvergeProfile,
  strict: boolean,
  codeCoverage: number,
  hasBehaviorEvidence: boolean,
  contradiction: boolean,
): boolean {
  if (contradiction) {
    return true;
  }
  if (!hasBehaviorEvidence) {
    return true;
  }

  const threshold = strict ? 0.9 : profile === "architecture-gap" ? 0.8 : 0.75;
  return codeCoverage < threshold;
}

export async function assessGaps(input: AssessmentInput): Promise<{
  gapMarkdown: string;
  gap: GapAssessmentResult;
}> {
  const requirements = parseObjectiveRequirements(input.targetSpecPath, input.targetSpecText);
  const documents = await listRepoDocuments(input.repoRoot, input.scope);
  const findings: GapFinding[] = [];

  let ordinal = 0;
  for (const requirement of requirements) {
    const signals = buildSignals(requirement.text);
    const allTerms = Array.from(new Set([...signals.keywords, ...signals.literals]));
    const behaviorTerms = Array.from(
      new Set([
        ...signals.behaviorActions,
        ...signals.behaviorEntities,
        ...signals.behaviorPhrases,
      ]),
    );
    if (allTerms.length === 0) {
      continue;
    }

    const matches = documents
      .map((document) => matchDocument(document, signals))
      .filter((candidate): candidate is DocumentMatch => candidate !== null)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        const sourceRank = (source: RepoDocument["source"]): number => {
          if (source === "code") {
            return 0;
          }
          if (source === "config") {
            return 1;
          }
          return 2;
        };
        return sourceRank(left.source) - sourceRank(right.source);
      });

    const codeMatches = matches.filter((match) => match.source === "code");
    const nonCodeMatches = matches
      .filter((match) => match.source !== "code")
      .filter((match) => !match.path.startsWith(".plan/"));

    const matchedCodeTerms = Array.from(
      new Set(codeMatches.flatMap((match) => [...match.matchedKeywords, ...match.matchedLiterals])),
    );
    const matchedNonCodeTerms = Array.from(
      new Set(
        nonCodeMatches.flatMap((match) => [...match.matchedKeywords, ...match.matchedLiterals]),
      ),
    ).filter((term) => !matchedCodeTerms.includes(term));

    const behaviorProbes = documents
      .flatMap((document) => collectBehaviorProbes(document, signals))
      .slice(0, 8);
    const matchedBehaviorActions = Array.from(
      new Set(behaviorProbes.flatMap((probe) => probe.matchedActions)),
    );
    const matchedBehaviorEntities = Array.from(
      new Set(
        behaviorProbes.flatMap((probe) => [...probe.matchedEntities, ...probe.matchedPhrases]),
      ),
    );

    const actionCoverage =
      signals.behaviorActions.length > 0
        ? matchedBehaviorActions.length / signals.behaviorActions.length
        : behaviorProbes.length > 0
          ? 1
          : 0;
    const entityCoverage =
      signals.behaviorEntities.length + signals.behaviorPhrases.length > 0
        ? matchedBehaviorEntities.length /
          Math.max(1, signals.behaviorEntities.length + signals.behaviorPhrases.length)
        : behaviorProbes.length > 0
          ? 1
          : 0;
    const behaviorCoverage = Number.parseFloat(
      (actionCoverage * 0.6 + entityCoverage * 0.4).toFixed(2),
    );

    const lexicalCoverage = matchedCodeTerms.length / allTerms.length;
    const codeCoverage =
      behaviorProbes.length > 0
        ? Math.max(behaviorCoverage, lexicalCoverage * 0.5)
        : lexicalCoverage * 0.3;
    const nonCodeCoverage = matchedNonCodeTerms.length / allTerms.length;
    const hasBehaviorEvidence = behaviorProbes.length > 0;
    const contradiction = detectContradiction(signals, behaviorProbes, codeMatches);

    if (
      !shouldEmitFinding(
        input.profile,
        signals.strict,
        codeCoverage,
        hasBehaviorEvidence,
        contradiction.hasConflict,
      )
    ) {
      continue;
    }

    const kind: GapFinding["kind"] = contradiction.hasConflict
      ? "wrong"
      : hasBehaviorEvidence
        ? codeCoverage < 0.3
          ? "missing"
          : "partial"
        : "missing";

    const category = classifyCategory(requirement.text);
    const severity = inferSeverity(input.profile, signals, kind, codeCoverage);
    const confidence = inferConfidence(
      kind,
      contradiction.hasConflict,
      codeCoverage,
      nonCodeCoverage,
    );

    const affectedPaths =
      codeMatches.length > 0
        ? Array.from(new Set(codeMatches.slice(0, 3).map((match) => match.path)))
        : defaultAffectedPathsForCategory(category);

    const uncoveredBehaviorTerms = behaviorTerms.filter(
      (term) => !matchedBehaviorActions.includes(term) && !matchedBehaviorEntities.includes(term),
    );
    const recommended = recommendedAction(input.profile, requirement);

    ordinal += 1;
    const finding: GapFinding = {
      finding_id: `G-${String(ordinal).padStart(3, "0")}`,
      fingerprint: "",
      title: `${requirement.section}: objective gap`,
      kind,
      severity,
      category,
      summary: `Requirement is not fully implemented: ${requirement.text}`,
      expected_behavior: requirement.text,
      current_behavior: summarizeCurrentBehavior(
        requirement,
        codeCoverage,
        nonCodeCoverage,
        behaviorProbes,
        matchedNonCodeTerms,
        uncoveredBehaviorTerms,
        contradiction,
      ),
      evidence: summarizeEvidence(
        requirement,
        codeCoverage,
        nonCodeCoverage,
        matchedBehaviorActions,
        matchedBehaviorEntities,
        matchedNonCodeTerms,
        behaviorProbes,
        codeMatches,
        nonCodeMatches,
      ),
      objective_refs: [requirement.objectiveRef],
      affected_paths: affectedPaths,
      recommended_direction: recommended,
      recommended_action: recommended,
      confidence,
    };

    finding.fingerprint = buildFindingFingerprint(input.profile, finding);
    findings.push(finding);
  }

  findings.sort((left, right) => {
    const severityOrder = compareSeverity(left.severity, right.severity);
    if (severityOrder !== 0) {
      return severityOrder;
    }
    return left.title.localeCompare(right.title);
  });

  const assessment: GapAssessmentResult = {
    version: 1,
    profile: input.profile,
    review_id: input.reviewId,
    target_spec_path: input.targetSpecPath,
    findings,
    generated_at: input.generatedAt,
  };

  const markdownLines: string[] = [
    "# Gap Assessment",
    "",
    "## Assessment Scope",
    "",
    `- Target spec: ${input.targetSpecPath}`,
    `- Profile: ${input.profile}`,
    `- Scope: ${input.scope.length > 0 ? input.scope.join(", ") : "(repo root)"}`,
    `- Requirements analyzed: ${String(requirements.length)}`,
    `- Findings: ${String(findings.length)}`,
    "",
    "## Overall Conclusion",
    "",
    findings.length === 0
      ? "No material in-scope gaps were identified for this pass."
      : `${String(findings.length)} in-scope gap(s) were identified relative to the target spec.`,
    "",
    findings.length === 0 ? "## Findings" : "## Ordered Findings",
    "",
  ];

  for (const finding of findings) {
    markdownLines.push(`### ${finding.finding_id} ${finding.title}`);
    markdownLines.push(`- Kind: ${finding.kind}`);
    markdownLines.push(`- Severity: ${finding.severity}`);
    markdownLines.push(`- Confidence: ${String(finding.confidence)}`);
    markdownLines.push(`- Category: ${finding.category}`);
    markdownLines.push(`- Expected behavior: ${finding.expected_behavior}`);
    markdownLines.push(`- Current behavior: ${finding.current_behavior}`);
    markdownLines.push(`- Summary: ${finding.summary}`);
    markdownLines.push(`- Evidence: ${finding.evidence.join(" | ")}`);
    markdownLines.push(`- Affected paths: ${finding.affected_paths.join(", ") || "(none)"}`);
    markdownLines.push(`- Recommended direction: ${finding.recommended_direction}`);
    markdownLines.push("");
  }

  return {
    gapMarkdown: markdownLines.join("\n"),
    gap: assessment,
  };
}

export const assessObjective = assessGaps;
