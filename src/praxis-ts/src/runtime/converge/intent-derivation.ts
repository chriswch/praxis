import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterName } from "../../contracts/model.js";
import { runAdapterSubprocess } from "./executors/adapter-subprocess.js";

export interface DerivedIntent {
  objectiveMarkdown: string;
  embeddedCommands: string[];
  derivedSections: { command: string; output: string }[];
}

// Detect backtick-quoted slash commands in an intent string. Matches one or
// more occurrences of `` `/<command>...` ``. The returned commands preserve
// intent ordering so callers can run them sequentially.
export function extractEmbeddedSlashCommands(intent: string): string[] {
  const pattern = /`(\/[A-Za-z][\w:\-\s]*)`/g;
  const commands: string[] = [];
  for (const match of intent.matchAll(pattern)) {
    commands.push(match[1].trim());
  }
  return commands;
}

// Scenario-1 derivation (G-04): when the intent embeds backtick-quoted slash
// commands, dispatch each as a short adapter session. Concatenate outputs into
// .praxis/objective.md as the authoritative input for clarifying-intent.
// Plain-text intents are written through unchanged.
export async function deriveObjectiveMarkdown(
  intent: string,
  adapter: AdapterName,
  repoRoot: string,
): Promise<DerivedIntent> {
  const trimmed = intent.trim();
  const embeddedCommands = extractEmbeddedSlashCommands(trimmed);
  if (embeddedCommands.length === 0) {
    return {
      objectiveMarkdown: buildPlainObjectiveMarkdown(trimmed),
      embeddedCommands: [],
      derivedSections: [],
    };
  }

  const derivedSections: { command: string; output: string }[] = [];
  for (const command of embeddedCommands) {
    const prompt = [
      command,
      "",
      "You are executing an embedded Praxis derivation command for objective-driven remediation.",
      "Produce a concise markdown response with concrete findings, expectations, and references.",
      "Write only the response body — no preamble, no meta-commentary.",
    ].join("\n");
    const result = await runAdapterSubprocess({ adapter, prompt, repoRoot, timeoutMs: 10 * 60 * 1000 });
    if (result.exitCode !== 0) {
      throw new Error(
        `Embedded command ${command} failed (${adapter} exit ${String(result.exitCode)}): ${result.stderr.trim() || "no stderr"}`,
      );
    }
    derivedSections.push({ command, output: result.stdout.trim() });
  }

  return {
    objectiveMarkdown: buildDerivedObjectiveMarkdown(trimmed, derivedSections),
    embeddedCommands,
    derivedSections,
  };
}

export async function writeObjectiveMarkdown(
  repoRoot: string,
  objectiveMarkdown: string,
): Promise<string> {
  const relativePath = ".praxis/objective.md";
  const absolutePath = join(repoRoot, relativePath);
  await writeFile(absolutePath, `${objectiveMarkdown.trimEnd()}\n`, "utf8");
  return relativePath;
}

function buildPlainObjectiveMarkdown(intent: string): string {
  return [
    "# Objective",
    "",
    "## Intent",
    "",
    intent,
    "",
    "## Acceptance Criteria",
    "",
    `- Must ${intent.replace(/^\s*[Mm]ust\s+/, "")}`,
    "",
  ].join("\n");
}

function buildDerivedObjectiveMarkdown(
  intent: string,
  derivedSections: { command: string; output: string }[],
): string {
  const lines = [
    "# Objective",
    "",
    "## Intent",
    "",
    intent,
    "",
    "## Derived Context",
    "",
  ];
  for (const section of derivedSections) {
    lines.push(`### Output of ${section.command}`);
    lines.push("");
    lines.push(section.output);
    lines.push("");
  }
  lines.push("## Acceptance Criteria", "", "- Must reconcile the intent above with the derived context.", "");
  return lines.join("\n");
}
