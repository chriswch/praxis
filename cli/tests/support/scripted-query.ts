import type {
  AgentEvent,
  AgentQuery,
  CreateQueryFn,
} from "../../src/workflow/stage.js";

/**
 * One scripted SDK turn-stream: an ordered list of events the fake `query()`
 * yields for a single stage invocation, plus an optional sessionId that the
 * stream advertises (mirrors the real SDK's `sess_…` id).
 */
export type Script = {
  events: AgentEvent[];
  sessionId?: string;
};

/**
 * Build a `createQueryFn` that returns the next pre-recorded script per call.
 * Tests use this to exercise stage execution without hitting the real SDK.
 *
 * Usage:
 *   const createQueryFn = scriptedQuery([
 *     { events: [{ type: "assistant_text", text: "ok" }], sessionId: "s1" },
 *   ]);
 */
export function scriptedQuery(scripts: Script[]): CreateQueryFn {
  let i = 0;
  return () => {
    const script = scripts[i++];
    if (!script) {
      throw new Error(
        `scriptedQuery: ran out of scripted turns (configured ${scripts.length})`,
      );
    }
    const stream: AgentQuery = {
      sessionId: script.sessionId,
      [Symbol.asyncIterator]: async function* () {
        for (const event of script.events) {
          yield event;
        }
      },
    };
    return stream;
  };
}
