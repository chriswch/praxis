import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PermissionMode, StageConfig } from "../config/schema.js";
import type { Reporter } from "../ui/reporter.js";

/** Praxis-internal abstraction the Reporter consumes (S-003). */
export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; name: string; brief: string }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "error"; message: string };

/**
 * Praxis-internal subset of the SDK's discriminated union — only the shapes
 * we actually consume. Lives at the seam so tests can script messages without
 * pulling in the real SDK types.
 */
export type SdkMessage =
  | {
      type: "system";
      subtype: "init";
      session_id: string;
      model: string;
    }
  | {
      type: "assistant";
      session_id: string;
      message: {
        content: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; name: string; input: unknown }
          | {
              type: "tool_result";
              tool_use_id: string;
              content: unknown;
              is_error?: boolean;
            }
        >;
      };
    }
  | {
      type: "result";
      subtype: "success";
      stop_reason: string | null;
      total_cost_usd: number;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
      num_turns: number;
      session_id: string;
    };

export type StageResult = {
  finalText: string;
  turns: number;
  stopReason: string;
  cancelReason?: "timeout" | "sigint";
  sessionId: string;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreate: number;
  };
  usd: number;
};

export type StageContext = {
  intent: string;
  runDir: string;
  runId: string;
  reporter: Reporter;
  signal: AbortSignal;
  /** Resolved artifact paths for stages that have already run. */
  artifactPaths: Record<string, string>;
};

/**
 * The seam exposed to tests. Returns an async iterable of `SdkMessage` (the
 * scripted shape) plus a `pushUserMessage` callback so the harness can send a
 * single corrective user prompt after a validator failure (product.md §5.2).
 */
export type CreateQueryFnInput = {
  systemPrompt: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  model?: string;
  settingSources: ["user", "project"];
  signal: AbortSignal;
  initialUserPrompt: string;
};

export type CreateQueryFnHandle = {
  stream: AsyncIterable<SdkMessage>;
  pushUserMessage(text: string): void;
};

export type CreateQueryFn = (input: CreateQueryFnInput) => CreateQueryFnHandle;

/** Dependencies threaded through the workflow for substitution in tests. */
export type Deps = {
  clock: () => Date;
  rng: (n: number) => Uint8Array;
  createQueryFn: CreateQueryFn;
};

/** Backwards-compat alias kept so any older external import keeps compiling. */
export type AgentQuery = AsyncIterable<SdkMessage> & { sessionId?: string };

const PROMPTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
  "prompts",
);

/**
 * Resolve and load the system prompt for a stage. Filenames in
 * `StageConfig.systemPrompt.file` are relative to `src/config/prompts/`.
 */
export function loadSystemPrompt(config: StageConfig): string {
  return readFileSync(join(PROMPTS_DIR, config.systemPrompt.file), "utf8");
}

/**
 * Build a stage's initial user prompt by interpolating
 * `{{intent}}`, `{{runDir}}`, and `{{artifacts.<id>.path}}` tokens. Missing
 * tokens throw — the harness guarantees these are populated before runStage.
 */
export function buildUserPrompt(
  config: StageConfig,
  ctx: Pick<StageContext, "intent" | "runDir" | "artifactPaths">,
): string {
  const template =
    typeof config.userPromptTemplate === "string"
      ? config.userPromptTemplate
      : readFileSync(
          join(PROMPTS_DIR, config.userPromptTemplate.file),
          "utf8",
        );

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, raw: string) => {
    const token = raw.trim();
    if (token === "intent") return ctx.intent;
    if (token === "runDir") return ctx.runDir;
    const artifactMatch = /^artifacts\.([^.]+)\.path$/.exec(token);
    if (artifactMatch) {
      const stageId = artifactMatch[1];
      const path = ctx.artifactPaths[stageId];
      if (!path) {
        throw new Error(
          `buildUserPrompt: unknown artifact reference {{artifacts.${stageId}.path}} (no completed stage with that id)`,
        );
      }
      return path;
    }
    throw new Error(`buildUserPrompt: unknown interpolation token: {{${token}}}`);
  });
}

/**
 * Execute a single stage end-to-end against the SDK seam.
 *
 * Behavior:
 *   - Opens one `createQueryFn` call with the configured prompts + options.
 *   - Drains the SdkMessage stream, capturing assistant text per turn,
 *     session id, usage, and stop reason.
 *   - If the stage defines a `validate` and the first finalText fails, sends
 *     one corrective user message via `pushUserMessage` and waits for the
 *     next result (product.md §5.2). One retry only; second failure is
 *     terminal and the partial text is returned with `stopReason:
 *     "validator_failed"`.
 *   - tokens.input/output/cache* are summed across attempts; usd is summed.
 *   - sessionId reflects the last attempt (so on retry success it's the
 *     retry's id).
 */
export async function runStage(
  config: StageConfig,
  ctx: StageContext,
  deps: Pick<Deps, "createQueryFn">,
): Promise<StageResult> {
  const systemPrompt = loadSystemPrompt(config);
  const initialUserPrompt = buildUserPrompt(config, ctx);

  const handle = deps.createQueryFn({
    systemPrompt,
    allowedTools: config.allowedTools,
    permissionMode: config.permissionMode,
    model: config.model,
    settingSources: ["user", "project"],
    signal: ctx.signal,
    initialUserPrompt,
  });

  let attempt = 0;
  let finalText = "";
  let sessionId = "";
  let stopReason = "";
  let turns = 0;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  let usd = 0;
  let lastValidationReason: string | undefined;

  let pendingText = "";
  for await (const msg of handle.stream) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
      continue;
    }
    if (msg.type === "assistant") {
      sessionId = msg.session_id;
      for (const block of msg.message.content) {
        if (block.type === "text") {
          pendingText += block.text;
        }
      }
      continue;
    }
    if (msg.type === "result") {
      sessionId = msg.session_id;
      stopReason = msg.stop_reason ?? "";
      turns = msg.num_turns;
      tokens.input += msg.usage.input_tokens;
      tokens.output += msg.usage.output_tokens;
      tokens.cacheRead += msg.usage.cache_read_input_tokens;
      tokens.cacheCreate += msg.usage.cache_creation_input_tokens;
      usd += msg.total_cost_usd;
      finalText = pendingText;
      pendingText = "";

      if (config.validate) {
        const verdict = config.validate(finalText);
        if (verdict.ok) {
          break;
        }
        attempt++;
        if (attempt >= 2) {
          stopReason = "validator_failed";
          lastValidationReason = verdict.reason;
          break;
        }
        lastValidationReason = verdict.reason;
        handle.pushUserMessage(
          `Your previous output did not match the required schema: ${verdict.reason}. Re-emit only the markdown artifact.`,
        );
        continue;
      }

      break;
    }
  }

  // `lastValidationReason` is captured to support a future `state.error`
  // field once the orchestrator wires per-stage state updates (S-002 next
  // cycle). We void it here so an unused-binding lint won't trip.
  void lastValidationReason;

  return {
    finalText,
    turns,
    stopReason,
    sessionId,
    tokens,
    usd,
  };
}
