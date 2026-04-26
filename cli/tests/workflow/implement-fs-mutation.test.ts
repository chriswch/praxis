import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { runStage } from "../../src/workflow/stage.js";
import type {
  CreateQueryFn,
  CreateQueryFnHandle,
  SdkMessage,
  StageContext,
} from "../../src/workflow/stage.js";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { LineReporter } from "../../src/ui/line-reporter.js";

/**
 * S-005 AC-9 — option-(a) sociable test.
 *
 * Most implement tests use option-(b) — the scripted SDK stream just emits
 * `tool_use` blocks and we trust the SDK's ToolHost to actually write to
 * disk. This test wires the side effect into the seam itself: the scripted
 * `createQueryFn` writes a real file alongside emitting the matching
 * `tool_use` block. We then assert the runner's `runStage` sees the
 * filesystem mutation post-stage via `existsSync` on the real path. This
 * proves the runner doesn't gate fs visibility on its own — it observes
 * whatever the seam (or SDK) actually wrote.
 *
 * No new runner code needed; the assertion lives entirely in the test.
 */

function implementConfig() {
  const cfg = defaultWorkflow.workflow.find((s) => s.id === "implement");
  if (!cfg) throw new Error("implement stage missing from defaultWorkflow");
  return cfg;
}

/**
 * Compose a one-shot SDK-stream that, before yielding a `tool_use` block,
 * synchronously writes the file the tool would have created. The runner
 * sees the same fs state the real SDK + ToolHost would produce.
 */
function fsMutatingQuery(
  filePath: string,
  fileContent: string,
  sessionId: string,
): CreateQueryFn {
  return () => {
    const messages: SdkMessage[] = [
      { type: "system", subtype: "init", session_id: sessionId, model: "claude-test" },
      {
        type: "assistant",
        session_id: sessionId,
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_write",
              name: "Write",
              input: { file_path: filePath, content: fileContent },
            },
            {
              type: "tool_result",
              tool_use_id: "tu_write",
              content: "ok",
              is_error: false,
            },
          ],
        },
      },
      {
        type: "assistant",
        session_id: sessionId,
        message: { content: [{ type: "text", text: "wrote logout.tsx\n" }] },
      },
      {
        type: "result",
        subtype: "success",
        stop_reason: "end_turn",
        total_cost_usd: 0,
        usage: {
          input_tokens: 5,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        num_turns: 1,
        session_id: sessionId,
      },
    ];

    const handle: CreateQueryFnHandle = {
      pushUserMessage() {},
      stream: (async function* () {
        for (const m of messages) {
          // Side-effect: as soon as the tool_use lands, the file would be
          // written by the SDK's ToolHost under bypassPermissions. Inline
          // it so the runner observes the mutation alongside the event.
          if (m.type === "assistant") {
            for (const block of m.message.content) {
              if (block.type === "tool_use" && block.name === "Write") {
                const input = block.input as { file_path: string; content: string };
                writeFileSync(input.file_path, input.content, "utf8");
              }
            }
          }
          yield m;
        }
      })(),
    };
    return handle;
  };
}

describe("implement fs mutation observation (AC-9)", () => {
  it("runStage sees filesystem mutations the seam performs alongside tool_use blocks", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const targetPath = join(cwd, "src", "Logout.tsx");
      const targetContent = "export const Logout = () => null;\n";

      // Pre-create the parent dir; the implement stage's tool would too.
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(cwd, "src"), { recursive: true });

      const ctx: StageContext = {
        intent: "add a logout button",
        runDir: cwd,
        runId: "2026-04-25-1430-7af2",
        reporter: new LineReporter(),
        signal: new AbortController().signal,
        artifactPaths: { "clarify-assess": join(cwd, "01-clarify-assess.md") },
      };

      // File doesn't exist before the stage runs.
      expect(existsSync(targetPath)).toBe(false);

      await runStage(implementConfig(), ctx, {
        createQueryFn: fsMutatingQuery(targetPath, targetContent, "sess_fs"),
      });

      // The runner observed the mutation via the real filesystem — no special
      // bookkeeping needed.
      expect(existsSync(targetPath)).toBe(true);
      expect(readFileSync(targetPath, "utf8")).toBe(targetContent);
    });
  });
});
