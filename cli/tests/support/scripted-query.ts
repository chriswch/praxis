import type {
  CreateQueryFn,
  CreateQueryFnHandle,
  CreateQueryFnInput,
  SdkMessage,
} from "../../src/workflow/stage.js";

/**
 * One scripted SDK turn-stream: an ordered list of `SdkMessage`s the fake
 * `query()` yields for a single stage invocation. Use multiple `Script`s when
 * a single stage call should yield two `result` messages (e.g. validator
 * retry exercising `pushUserMessage`).
 */
export type Script = {
  messages: SdkMessage[];
};

/**
 * Build a `createQueryFn` that returns the next pre-recorded script per call,
 * with each script's messages flowing as one stream. If `scripts` has multiple
 * entries, they're concatenated lazily so a `pushUserMessage` between scripts
 * delivers the next one — matching the SDK's push-based corrective-message
 * flow.
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
    const handle: CreateQueryFnHandle = {
      pushUserMessage() {},
      stream: (async function* () {
        for (const m of script.messages) yield m;
      })(),
    };
    return handle;
  };
}

/**
 * Recording createQueryFn. Captures every input passed to it and the
 * corrective user messages pushed after the stream opens. Tests use this for
 * argument-passing assertions (AC-9) and validator-retry choreography (AC-6/7).
 */
export type RecordingCreateQueryFn = CreateQueryFn & {
  calls: Array<{
    input: CreateQueryFnInput;
    pushedUserMessages: string[];
  }>;
};

export function recordingScriptedQuery(
  scripts: Script[][],
): RecordingCreateQueryFn {
  let i = 0;
  const calls: RecordingCreateQueryFn["calls"] = [];
  const fn: CreateQueryFn = (input) => {
    const callIndex = i++;
    const callScripts = scripts[callIndex];
    if (!callScripts) {
      throw new Error(
        `recordingScriptedQuery: ran out of scripted calls (configured ${scripts.length})`,
      );
    }
    const pushedUserMessages: string[] = [];
    calls.push({ input, pushedUserMessages });

    let scriptIdx = 0;
    let pending: SdkMessage[] = [...(callScripts[scriptIdx]?.messages ?? [])];

    const handle: CreateQueryFnHandle = {
      pushUserMessage(text) {
        pushedUserMessages.push(text);
        scriptIdx++;
        const next = callScripts[scriptIdx];
        if (next) pending.push(...next.messages);
      },
      stream: (async function* () {
        // Drain pending; if pushUserMessage was called we'll see new messages.
        while (pending.length > 0) {
          const m = pending.shift()!;
          yield m;
        }
      })(),
    };
    return handle;
  };
  const recording = fn as RecordingCreateQueryFn;
  recording.calls = calls;
  return recording;
}

/**
 * Build a `createQueryFn` whose stream emits an `init` message and then
 * blocks forever — used to exercise abort paths (timeoutMs, SIGINT) in
 * `runStage` without racing on real I/O. The stream resolves only when the
 * stage-local AbortSignal fires; on abort the iterator returns cleanly so the
 * `for await` loop in `runStage` exits.
 */
export function hangingQuery(initSessionId = "sess_hang"): CreateQueryFn {
  return (input) => {
    const handle: CreateQueryFnHandle = {
      pushUserMessage() {},
      stream: (async function* () {
        yield {
          type: "system",
          subtype: "init",
          session_id: initSessionId,
          model: "claude-test",
        } satisfies SdkMessage;
        // Wait until the stage aborts us.
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) return resolve();
          input.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        return;
      })(),
    };
    return handle;
  };
}
