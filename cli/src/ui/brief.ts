/**
 * Map a tool name + raw `input` blob (from the SDK's `tool_use` block) to a
 * short, single-line summary suitable for the `  › ToolName(brief)` line in
 * §8 LineReporter output. Returns `""` when the input shape isn't recognised
 * — the formatter falls back to `ToolName()`.
 *
 * Truncation: anything over 60 chars is cropped + ellipsis. Long bash commands
 * and free-form Task descriptions can otherwise blow past terminal width.
 */
const MAX_BRIEF_LEN = 60;

export function briefFor(name: string, input: unknown): string {
  if (!isObject(input)) return "";

  switch (name) {
    case "Read":
    case "Edit":
    case "Write": {
      const fp = stringField(input, "file_path");
      return fp ?? "";
    }
    case "Glob": {
      const p = stringField(input, "pattern");
      return p ?? "";
    }
    case "Grep": {
      const pat = stringField(input, "pattern");
      if (!pat) return "";
      const path = stringField(input, "path");
      return path ? `${pat} in ${path}` : pat;
    }
    case "Bash": {
      const cmd = stringField(input, "command");
      return cmd ? truncate(cmd) : "";
    }
    case "Task": {
      const desc = stringField(input, "description");
      return desc ? truncate(desc) : "";
    }
    default:
      return "";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function truncate(s: string): string {
  if (s.length <= MAX_BRIEF_LEN) return s;
  return `${s.slice(0, MAX_BRIEF_LEN)}…`;
}
