import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CreateQueryFn,
  CreateQueryFnHandle,
  SdkMessage,
} from "./stage.js";

/**
 * Production `CreateQueryFn`: wraps `@anthropic-ai/claude-agent-sdk`'s
 * `query()` and exposes the push-based corrective-message channel that the
 * harness needs for validator retry (product.md §5.2).
 *
 * Only the subset of SDK message shapes Praxis actually consumes is mapped
 * into `SdkMessage`.
 *
 * Lifecycle: the consumer (`runStage`) decides when the stage is over and
 * aborts the signal that's threaded into the SDK. This wrapper does NOT
 * terminate after the first `result` message — validator retry expects a
 * second `result` from the same stream after `pushUserMessage`.
 */
export const sdkCreateQueryFn: CreateQueryFn = (input) => {
  const userQueue: { resolve: (msg: SdkUserMessageLite | null) => void }[] = [];
  const pending: SdkUserMessageLite[] = [
    { type: "user", message: { role: "user", content: input.initialUserPrompt } },
  ];
  let closed = false;

  function closeUserPrompts(): void {
    if (closed) return;
    closed = true;
    while (userQueue.length > 0) {
      userQueue.shift()!.resolve(null);
    }
  }

  // When the consumer aborts, wake up any awaiting userPrompts() iterator and
  // let it terminate so the SDK tears down its own loop cleanly.
  const onAbort = () => closeUserPrompts();
  if (input.signal.aborted) {
    closeUserPrompts();
  } else {
    input.signal.addEventListener("abort", onAbort, { once: true });
  }

  async function* userPrompts(): AsyncIterable<SdkUserMessageLite> {
    while (true) {
      if (closed) return;
      if (pending.length > 0) {
        yield pending.shift()!;
        continue;
      }
      const next = await new Promise<SdkUserMessageLite | null>((resolve) => {
        userQueue.push({ resolve });
      });
      if (next === null) return;
      yield next;
    }
  }

  // The real SDK `Options` type exports a wide union; we narrow to what we use.
  const options: Record<string, unknown> = {
    settingSources: input.settingSources,
    abortController: { signal: input.signal } as unknown as AbortController,
  };
  if (input.systemPrompt) {
    options.systemPrompt = input.systemPrompt;
  }
  if (input.allowedTools) options.allowedTools = input.allowedTools;
  if (input.permissionMode) options.permissionMode = input.permissionMode;
  if (input.model) options.model = input.model;

  const sdkStream = query({
    prompt: userPrompts() as never,
    options: options as never,
  });

  const handle: CreateQueryFnHandle = {
    pushUserMessage(text) {
      const msg: SdkUserMessageLite = {
        type: "user",
        message: { role: "user", content: text },
      };
      const waiter = userQueue.shift();
      if (waiter) waiter.resolve(msg);
      else pending.push(msg);
    },
    stream: (async function* () {
      try {
        for await (const msg of sdkStream) {
          const lite = adapt(msg);
          if (lite) yield lite;
          // Do NOT terminate on `result` — the consumer may push a corrective
          // user message and expect a follow-up `result` in the same stream
          // (product.md §5.2 validator retry). Termination is signalled by the
          // consumer aborting `input.signal`.
        }
      } finally {
        // SDK iterator finished or threw — make sure the user-prompt async
        // iterable also wakes up so its surrounding promise is collectable.
        closeUserPrompts();
      }
    })(),
  };
  return handle;
};

type SdkUserMessageLite = {
  type: "user";
  message: { role: "user"; content: string };
};

/** Convert one raw SDK message into the Praxis `SdkMessage` subset, or null. */
function adapt(raw: unknown): SdkMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type === "system" && r.subtype === "init") {
    return {
      type: "system",
      subtype: "init",
      session_id: String(r.session_id ?? ""),
      model: String(r.model ?? ""),
    };
  }
  if (r.type === "assistant") {
    const message = (r.message as { content?: unknown }) ?? {};
    const content = Array.isArray(message.content) ? message.content : [];
    type AssistantBlock =
      | { type: "text"; text: string }
      | { type: "tool_use"; name: string; input: unknown }
      | {
          type: "tool_result";
          tool_use_id: string;
          content: unknown;
          is_error?: boolean;
        };
    const blocks: AssistantBlock[] = [];
    for (const b of content) {
      if (!b || typeof b !== "object") continue;
      const bb = b as Record<string, unknown>;
      if (bb.type === "text" && typeof bb.text === "string") {
        blocks.push({ type: "text", text: bb.text });
      } else if (bb.type === "tool_use" && typeof bb.name === "string") {
        blocks.push({ type: "tool_use", name: bb.name, input: bb.input });
      } else if (bb.type === "tool_result" && typeof bb.tool_use_id === "string") {
        blocks.push({
          type: "tool_result",
          tool_use_id: bb.tool_use_id,
          content: bb.content,
          is_error: bb.is_error === true ? true : undefined,
        });
      }
    }
    return {
      type: "assistant",
      session_id: String(r.session_id ?? ""),
      message: { content: blocks },
    };
  }
  if (r.type === "result" && r.subtype === "success") {
    const usage = (r.usage as Record<string, number>) ?? {};
    return {
      type: "result",
      subtype: "success",
      stop_reason:
        typeof r.stop_reason === "string" ? r.stop_reason : null,
      total_cost_usd: Number(r.total_cost_usd ?? 0),
      usage: {
        input_tokens: Number(usage.input_tokens ?? 0),
        output_tokens: Number(usage.output_tokens ?? 0),
        cache_read_input_tokens: Number(usage.cache_read_input_tokens ?? 0),
        cache_creation_input_tokens: Number(
          usage.cache_creation_input_tokens ?? 0,
        ),
      },
      num_turns: Number(r.num_turns ?? 0),
      session_id: String(r.session_id ?? ""),
    };
  }
  return null;
}
