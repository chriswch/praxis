import { describe, expect, it, vi } from "vitest";

/**
 * Verifies the production `sdkCreateQueryFn` does NOT terminate after the
 * first `result` SDK message. The validator-retry loop in `runStage` sends
 * a corrective `pushUserMessage` after the first result and expects a
 * follow-up result in the same stream.
 *
 * The previous wrapper short-circuited with `if (lite.type === "result")
 * return;` — that was correct for non-validator stages but silently broke
 * retry for `clarify-assess`. We mock the SDK at the module boundary so the
 * test exercises the real wrapper code without contacting the model.
 */
/**
 * Capture every options object handed to the SDK `query()` so AC-1 can assert
 * on the exact shape forwarded for each `permissionMode` value.
 */
const capturedOptions: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  return {
    query: vi.fn(
      (opts: { prompt: AsyncIterable<unknown>; options: unknown }) => {
        capturedOptions.push(opts.options as Record<string, unknown>);
        // Echo the user-prompt iterable back as one result-per-prompt so the
        // wrapper's stream emits a result for each pushed user message.
        return (async function* () {
          let i = 0;
          for await (const _userMsg of opts.prompt) {
            i++;
            yield {
              type: "system",
              subtype: "init",
              session_id: `sess_${i}`,
              model: "test",
            };
            yield {
              type: "assistant",
              session_id: `sess_${i}`,
              message: { content: [{ type: "text", text: `reply_${i}` }] },
            };
            yield {
              type: "result",
              subtype: "success",
              stop_reason: "end_turn",
              total_cost_usd: 0,
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                cache_read_input_tokens: 0,
                cache_creation_input_tokens: 0,
              },
              num_turns: i,
              session_id: `sess_${i}`,
            };
          }
        })();
      },
    ),
  };
});

import { sdkCreateQueryFn } from "../../src/workflow/sdk-create-query.js";

describe("sdkCreateQueryFn lifecycle", () => {
  it("does not terminate after the first `result` — observes both results when a corrective pushUserMessage is sent", async () => {
    const ctl = new AbortController();
    const handle = sdkCreateQueryFn({
      systemPrompt: "test",
      settingSources: ["user", "project"],
      signal: ctl.signal,
      initialUserPrompt: "first",
    });

    const observedResults: string[] = [];
    const consumer = (async () => {
      for await (const msg of handle.stream) {
        if (msg.type === "result") {
          observedResults.push(msg.session_id);
          if (observedResults.length === 1) {
            // Simulate validator retry — push a corrective message and
            // expect the wrapper to keep streaming.
            handle.pushUserMessage("retry");
            continue;
          }
          if (observedResults.length === 2) {
            ctl.abort();
            return;
          }
        }
      }
    })();

    await consumer;
    expect(observedResults).toEqual(["sess_1", "sess_2"]);
  });

  it("permissionMode 'bypassPermissions' forwards allowDangerouslySkipPermissions: true", async () => {
    capturedOptions.length = 0;
    const ctl = new AbortController();
    const handle = sdkCreateQueryFn({
      systemPrompt: "test",
      settingSources: ["user", "project"],
      signal: ctl.signal,
      initialUserPrompt: "first",
      permissionMode: "bypassPermissions",
    });
    // Drain just enough to ensure query() was invoked.
    const consumer = (async () => {
      for await (const msg of handle.stream) {
        if (msg.type === "result") {
          ctl.abort();
          return;
        }
      }
    })();
    await consumer;
    expect(capturedOptions.length).toBe(1);
    const opts = capturedOptions[0];
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
  });

  it("permissionMode other than 'bypassPermissions' omits allowDangerouslySkipPermissions", async () => {
    capturedOptions.length = 0;
    const ctl = new AbortController();
    const handle = sdkCreateQueryFn({
      systemPrompt: "test",
      settingSources: ["user", "project"],
      signal: ctl.signal,
      initialUserPrompt: "first",
      permissionMode: "default",
    });
    const consumer = (async () => {
      for await (const msg of handle.stream) {
        if (msg.type === "result") {
          ctl.abort();
          return;
        }
      }
    })();
    await consumer;
    expect(capturedOptions.length).toBe(1);
    const opts = capturedOptions[0];
    expect(opts.permissionMode).toBe("default");
    expect("allowDangerouslySkipPermissions" in opts).toBe(false);
  });

  it("permissionMode unset omits both fields", async () => {
    capturedOptions.length = 0;
    const ctl = new AbortController();
    const handle = sdkCreateQueryFn({
      systemPrompt: "test",
      settingSources: ["user", "project"],
      signal: ctl.signal,
      initialUserPrompt: "first",
    });
    const consumer = (async () => {
      for await (const msg of handle.stream) {
        if (msg.type === "result") {
          ctl.abort();
          return;
        }
      }
    })();
    await consumer;
    expect(capturedOptions.length).toBe(1);
    const opts = capturedOptions[0];
    expect("permissionMode" in opts).toBe(false);
    expect("allowDangerouslySkipPermissions" in opts).toBe(false);
  });

  it("terminates cleanly when the consumer aborts — the user-prompt iterable wakes up", async () => {
    const ctl = new AbortController();
    const handle = sdkCreateQueryFn({
      systemPrompt: "test",
      settingSources: ["user", "project"],
      signal: ctl.signal,
      initialUserPrompt: "first",
    });

    const observedResults: string[] = [];
    const consumer = (async () => {
      for await (const msg of handle.stream) {
        if (msg.type === "result") {
          observedResults.push(msg.session_id);
          ctl.abort();
          return;
        }
      }
    })();

    // Race: the consumer's abort must close the user-prompt iterable so the
    // SDK loop ends and `consumer` resolves. If we hang here, the wrapper is
    // leaking and the test runner timeout will surface it.
    await consumer;
    expect(observedResults).toEqual(["sess_1"]);
  });
});
