import { describe, expect, it } from "vitest";
import type { SdkMessage } from "../../src/workflow/stage.js";
import { scriptedQuery } from "./scripted-query.js";

const initMsg: SdkMessage = {
  type: "system",
  subtype: "init",
  session_id: "s-1",
  model: "claude-opus-4-7",
};
const resultMsg: SdkMessage = {
  type: "result",
  subtype: "success",
  stop_reason: "end_turn",
  total_cost_usd: 0,
  usage: {
    input_tokens: 1,
    output_tokens: 2,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  num_turns: 1,
  session_id: "s-1",
};

describe("scriptedQuery", () => {
  it("returns one pre-recorded turn-stream per call, in order", async () => {
    const factory = scriptedQuery([
      { messages: [initMsg, resultMsg] },
      {
        messages: [
          { ...initMsg, session_id: "s-2" },
          { ...resultMsg, session_id: "s-2" },
        ],
      },
    ]);

    const stream1 = factory({
      systemPrompt: "",
      settingSources: ["user", "project"],
      signal: new AbortController().signal,
      initialUserPrompt: "",
    });
    const collected1: SdkMessage[] = [];
    for await (const m of stream1.stream) collected1.push(m);
    expect(collected1.length).toBe(2);
    expect(collected1[0].type).toBe("system");

    const stream2 = factory({
      systemPrompt: "",
      settingSources: ["user", "project"],
      signal: new AbortController().signal,
      initialUserPrompt: "",
    });
    const collected2: SdkMessage[] = [];
    for await (const m of stream2.stream) collected2.push(m);
    expect(collected2.length).toBe(2);
    expect(collected2[1]).toMatchObject({ session_id: "s-2" });
  });

  it("throws once scripts are exhausted", () => {
    const factory = scriptedQuery([{ messages: [initMsg, resultMsg] }]);
    factory({
      systemPrompt: "",
      settingSources: ["user", "project"],
      signal: new AbortController().signal,
      initialUserPrompt: "",
    });
    expect(() =>
      factory({
        systemPrompt: "",
        settingSources: ["user", "project"],
        signal: new AbortController().signal,
        initialUserPrompt: "",
      }),
    ).toThrow(/ran out of scripted turns/);
  });
});
