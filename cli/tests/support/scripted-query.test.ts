import { describe, it, expect } from "vitest";
import { scriptedQuery } from "./scripted-query.js";
import type { AgentEvent } from "../../src/workflow/stage.js";

describe("scriptedQuery", () => {
  it("returns one pre-recorded turn-stream per call, in order", async () => {
    const events1: AgentEvent[] = [{ type: "assistant_text", text: "hi" }];
    const events2: AgentEvent[] = [
      { type: "tool_use", name: "Read", brief: "x.ts" },
      { type: "assistant_text", text: "done" },
    ];
    const factory = scriptedQuery([
      { events: events1, sessionId: "s-1" },
      { events: events2, sessionId: "s-2" },
    ]);

    const stream1 = factory({
      systemPrompt: "",
      userPrompt: "",
      signal: new AbortController().signal,
    });
    expect(stream1.sessionId).toBe("s-1");
    const collected1: AgentEvent[] = [];
    for await (const e of stream1) collected1.push(e);
    expect(collected1).toEqual(events1);

    const stream2 = factory({
      systemPrompt: "",
      userPrompt: "",
      signal: new AbortController().signal,
    });
    expect(stream2.sessionId).toBe("s-2");
    const collected2: AgentEvent[] = [];
    for await (const e of stream2) collected2.push(e);
    expect(collected2).toEqual(events2);
  });

  it("throws once scripts are exhausted", () => {
    const factory = scriptedQuery([
      { events: [{ type: "assistant_text", text: "only" }] },
    ]);
    factory({
      systemPrompt: "",
      userPrompt: "",
      signal: new AbortController().signal,
    });
    expect(() =>
      factory({
        systemPrompt: "",
        userPrompt: "",
        signal: new AbortController().signal,
      }),
    ).toThrow(/ran out of scripted turns/);
  });
});
