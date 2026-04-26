import type { StageConfig } from "../config/schema.js";
import type { Reporter } from "../ui/reporter.js";

export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; name: string; brief: string }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "error"; message: string };

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
};

/**
 * Async-iterable stream of agent events for a single SDK turn-stream. The
 * concrete shape is the Claude Agent SDK's `query()` response; tests provide
 * scripted iterables instead.
 */
export type AgentQuery = AsyncIterable<AgentEvent> & {
  /** Optional SDK-assigned id, exposed when the stream produces it. */
  sessionId?: string;
};

/**
 * Factory that opens an agent query for one stage. Real implementation wraps
 * `@anthropic-ai/claude-agent-sdk`'s `query()`; tests inject a scripted
 * factory.
 */
export type CreateQueryFn = (input: {
  systemPrompt: string;
  userPrompt: string;
  allowedTools?: string[];
  permissionMode?: StageConfig["permissionMode"];
  model?: string;
  signal: AbortSignal;
}) => AgentQuery;

/** Dependencies threaded through the workflow for substitution in tests. */
export type Deps = {
  clock: () => Date;
  rng: (n: number) => Uint8Array;
  createQueryFn: CreateQueryFn;
};

/**
 * Execute a single stage end-to-end. Implementation deferred to S-002+; the
 * signature anchors the DI seam (createQueryFn) for test injection.
 */
export async function runStage(
  _config: StageConfig,
  _ctx: StageContext,
  _deps: Pick<Deps, "createQueryFn">,
): Promise<StageResult> {
  throw new Error("runStage: not implemented in S-001");
}
