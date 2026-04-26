# Praxis — Product Spec

## 1. Goal

A CLI that drives an AI coding agent through a deterministic, resumable workflow. User states intent in one line; Praxis handles clarification, implementation, and commit. MVP ships a 3-stage pipeline with a stage-extensible architecture; multi-adapter support is deferred to v0.2.

## 2. Non-Goals (v0.1)

- No PR creation.
- No verification stage (test/build/typecheck before commit).
- No MCP server (in-process or external) — artifacts are plain markdown the agent writes via prompt convention.
- No Codex adapter.
- No `praxis retry` command — failed stages are terminal; recovery is `praxis advance` against a hand-fixed artifact, or a fresh `praxis run` (see §11).
- No cross-process SDK session resumption.
- No in-process session forking between stages — context flows via artifact file paths.
- No user-supplied config file (defaults are hardcoded).
- No `list`/`show` commands.
- No per-stage model / thinking-effort knobs.
- No per-stage / per-run USD cost cap.
- No worktree or container sandbox for the implement stage — it runs against `process.cwd()` with `bypassPermissions`.
- No TUI in v0.1 — line-streamed CLI output, with the UI layer abstracted so a TUI can be added later without touching the runner.
- No event log file — session IDs persisted in `state.json` are the debug surface (`claude --resume <id>` recovers full transcripts).

## 3. Tech Stack

- TypeScript, Node ≥ 20
- `@anthropic-ai/claude-agent-sdk` — executes Claude stages via `query()`
- `commander` (CLI parsing), `zod` (stage config validation), `simple-git` (git ops)
- No bundler; published as `praxis` bin

## 4. CLI Interface

```
praxis run "<intent>"        # start a new run
praxis advance <run-id>      # advance a paused or failed run (see §11)
```

Flags on `run`:

- `--no-pause` — disable all pause gates (full autopilot)
- `--allow-dirty` — proceed even if the working tree has uncommitted changes (see §10)

Working directory: `process.cwd()`. Praxis never `cd`s. Run-id is printed to stdout at the start of every `run` so the user can copy it for `advance`. Run-id timestamps are UTC.

`praxis run --help` and the README both name the implement-stage risk in plain language: the implement stage runs the agent with `bypassPermissions` against the current working directory; the agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. Use only on repos you can roll back.

## 5. Workflow

Three stages, sequential, artifact-mediated, **all running in fresh SDK sessions**:

| #   | Stage            | Default tools          | Permission mode     | Pause after | Output artifact                            |
| --- | ---------------- | ---------------------- | ------------------- | ----------- | ------------------------------------------ |
| 0   | (intent capture) | —                      | —                   | —           | `00-intent.txt`                            |
| 1   | `clarify-assess` | Read, Glob, Grep, Bash | `default`           | **yes**     | `01-clarify-assess.md`                     |
| 2   | `implement`      | all                    | `bypassPermissions` | no          | `02-implement-log.md` + working-tree edits |
| 3   | `auto-commit`    | Bash                   | `default`           | no          | `03-commit.txt` (commit SHA + message)     |

Autopilot semantics: stages auto-advance unless their config says `pauseAfter: true`. `clarify-assess` defaults to `pauseAfter: true`; the others to `false`. `--no-pause` overrides all.

Every `query()` call passes `settingSources: ["user", "project"]` so the agent inherits the user's and project's `CLAUDE.md`, configured skills, and other Claude Code settings. Same CLI may produce different output across machines depending on user setup; this is intentional.

**Artifact convention.** Each stage's "artifact" is the agent's **final assistant text** for that stage. Praxis writes it to the run directory under the configured filename. Stages downstream consume the artifact by **file path** in their prompt — they Read the file themselves, the file contents are not inlined into prompts. This keeps prompts small and the artifact contract a plain file on disk.

### 5.1 Stage 0 — intent capture

Write `<run-dir>/00-intent.txt` with the raw arg. No agent.

### 5.2 Stage 1 — clarify-assess

Runs with `permissionMode: "default"` and a strict tool allowlist: `Read`, `Glob`, `Grep`, `Bash`. No edit tools are reachable, so the stage is structurally read-only — the SDK refuses tool calls outside the allowed set.

System prompt directs the agent to:

1. Restate intent
2. Survey the repo (read-only) for relevant context
3. Identify ambiguities, assumptions, and gaps
4. Produce a plan with acceptance criteria
5. End by emitting **only the markdown artifact** as its final assistant message, conforming to the schema below

Markdown schema (embedded in the system prompt verbatim, fixed H2 order):

```markdown
## Intent

<one paragraph>

## Assumptions

- <bullet>

## Gaps

- <bullet> (may be empty: write "- none")

## Plan

1. <step> — <rationale>

## Acceptance

- <testable criterion> (at least one required)
```

**Harness validation.** After the agent's Stop event, Praxis runs a structural check on `finalText`:

- All five H2 headings present in the listed order
- `## Acceptance` section contains at least one non-empty bullet

On pass, harness writes `finalText` verbatim to `01-clarify-assess.md`.

**Retry policy.** On structural failure, the harness sends a single corrective user message in the same `query()` stream (`"Your previous output did not match the required schema: <reason>. Re-emit only the markdown artifact."`). One retry max; second failure → stage fails with the validation error. The partial output is still written to `01-clarify-assess.md` so the user can hand-edit it to satisfy the schema and run `praxis advance <run-id>` (which re-validates the on-disk artifact before proceeding — see §11).

Pause: prints artifact path, exits 0 with a `praxis advance <run-id>` hint.

Bounds: **no `maxTurns`**, `timeoutMs: 900_000` (15 min).

### 5.3 Stage 2 — implement

Runs in a **fresh SDK session**. The user prompt template references the clarify-assess artifact by path:

```
Read .praxis/runs/<run-id>/01-clarify-assess.md and implement the plan.
Edit files in the current working directory.
Your final message must summarize files changed, what each change does, and anything skipped.
```

The agent uses the Read tool to load the artifact. No content interpolation.

Permission mode: `bypassPermissions`. All tools allowed. **No worktree, no sandbox.** This is the high-blast-radius stage; the §4 warning is the user's only protection.

`02-implement-log.md` is the agent's `finalText`, written verbatim. Not validated, not parsed — purely a human-readable record.

Bounds: **no `maxTurns`**, `timeoutMs: 1_800_000` (30 min). Stage ends when the agent emits Stop, the timeout fires, or the user sends SIGINT.

### 5.4 Stage 3 — auto-commit

Pre-stage: run `git status --porcelain`. If empty, skip with a notice (no failure). Otherwise the diff to be committed is **everything dirty** — pre-flight (§10) guarantees the tree was clean at run start, so any dirt is from this run.

Runs in a **fresh SDK session** with `permissionMode: "default"` and `allowedTools: ["Bash"]`. The agent inspects the diff itself via `git diff` and `git log`. Implement-stage chatter would only confuse the message, so we don't pass `02-implement-log.md`.

Agent prompt: _"Generate a Conventional-Commits-style message for the staged + unstaged changes. Use `git diff` and `git log -10 --oneline` for context. Reply with only the commit message."_ The agent is trusted to limit itself to read-only git inspection; we don't enforce a Bash denylist.

Praxis then runs `git add -A` and `git commit -m <finalText>` directly (not via the agent — the agent's job is the message, not the commit). The commit lands on the current branch; v0.1 never switches branches (see v0.2 `--branch` in §13). SHA + message written to `03-commit.txt`.

`git add -A` covers Bash-driven mutations, deletions, renames, and new files. The trade-off: with `--allow-dirty`, any pre-existing dirty edits in the working tree are bundled into the commit. Documented in §10.

Bounds: **no `maxTurns`**, `timeoutMs: 300_000` (5 min).

### 5.5 Session strategy

All three stages run in fresh SDK sessions. Inter-stage context flows via artifact file paths the agent Reads itself. Each stage's SDK-assigned session id is captured in `state.json` and printed on stage end so the user can run `claude --resume <id>` to inspect the full transcript independently.

Praxis never re-runs a stage from the harness. Failure recovery is human-in-the-loop (§11): inspect the run dir, hand-fix the artifact if applicable, then `praxis advance` or start a fresh `praxis run`.

## 6. Stage Configuration Schema

Stages are an internal data structure; v0.1 has no user-overridable config file. The schema exists to make future extensibility cheap.

```ts
type StageConfig = {
  id: string; // unique within workflow
  systemPrompt: { file: string }; // path resolved against src/config/prompts/
  userPromptTemplate: string; // {{intent}}, {{runDir}}, {{artifacts.<id>.path}} interpolation
  allowedTools?: string[]; // SDK tool names; omit = all
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  model?: string; // SDK model id; per-stage default set in defaults.ts; not user-exposed in v0.1
  maxTurns?: number; // omit = unbounded
  timeoutMs?: number; // omit = unbounded
  outputArtifact: string; // filename within run-dir; finalText written verbatim
  validate?: (text: string) => { ok: true } | { ok: false; reason: string };
  // optional structural check on finalText; one corrective retry on fail
  pauseAfter?: boolean; // default false
};

type PraxisConfig = {
  version: 1;
  workflow: StageConfig[];
};
```

The default workflow is exported from `src/config/defaults.ts`. The `validate` hook for `clarify-assess` runs the H2-schema check from §5.2. System prompts for all default stages live as separate `.md` files under `src/config/prompts/` (see §12); prompt iteration happens without TS recompiles.

Default models per stage (pinned in `defaults.ts`, not user-overridable in v0.1):

- `clarify-assess` → `claude-opus-4-7`
- `implement` → `claude-opus-4-7`
- `auto-commit` → `claude-haiku-4-5-20251001` (cheap and sufficient for commit-message generation)

Interpolation tokens: `{{intent}}` (raw user arg), `{{runDir}}` (absolute path to run dir), `{{artifacts.<stage-id>.path}}` (absolute path to that stage's artifact file).

## 7. Agent Execution

v0.1 ships a single `runStage(config, ctx)` function in `src/workflow/stage.ts` that calls `@anthropic-ai/claude-agent-sdk` directly. **No multi-adapter abstraction yet** — designing a two-implementation interface against one implementation locks in wrong assumptions. When Codex lands in v0.2, refactor to an `AgentAdapter` interface whose shape is informed by both real backends (current target backend: the Codex Agent SDK).

Every `query()` call passes `settingSources: ["user", "project"]` plus the stage's configured `model` (see §6 for defaults).

```ts
type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; name: string; brief: string } // e.g. "Read(src/foo.ts)"
  | { type: "tool_result"; name: string; ok: boolean } // bodies omitted
  | { type: "error"; message: string };

type StageResult = {
  finalText: string;
  turns: number;
  stopReason: string;
  cancelReason?: "timeout" | "sigint";
  sessionId: string; // SDK-assigned; persisted + printed
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreate: number;
  };
  usd: number;
};
```

`runStage` takes an `AbortSignal` (for SIGINT) and the `Reporter` from §8. `timeoutMs` is enforced inside `runStage` via `setTimeout(() => abortController.abort("timeout"), timeoutMs)` on the same `AbortController` used for SIGINT. The abort reason (`"timeout"` vs `"sigint"`) is preserved so §11 can label the failure correctly.

If `validate` is set on the stage and the first `finalText` fails, `runStage` sends a corrective user message in the same `query()` stream and waits for a second Stop. One retry only.

## 8. UI Layer

The runner emits to a `Reporter` interface; v0.1 ships a single `LineReporter` (stdout). A future TUI is added by implementing a second `Reporter` and selecting it in `cli.ts`.

```ts
interface Reporter {
  stageStart(stage: StageConfig, idx: number, total: number): void;
  stageEvent(e: AgentEvent): void;
  stageEnd(
    stage: StageConfig,
    result: {
      ok: boolean;
      artifactPath?: string;
      sessionId?: string;
      error?: string;
    },
  ): void;
  paused(runId: string, stageId: string, artifactPath: string): void;
  runDone(
    runId: string,
    summary: {
      commitSha?: string;
      cost: { totalTokens: number; totalUsd: number };
      perStage: Record<
        string,
        { tokens: number; usd: number; sessionId: string }
      >;
    },
  ): void;
}
```

`LineReporter` formatting:

```
[1/3 clarify-assess] starting…
  › surveying repo structure
  › Glob(src/**/*.ts)
  › Read(package.json)
  › Bash(git log -5)
  › drafting plan
[1/3 clarify-assess] artifact: .praxis/runs/2026-04-25-1430-7af2/01-clarify-assess.md
[1/3 clarify-assess] session: sess_01ABC… (claude --resume sess_01ABC… to inspect)
[1/3 clarify-assess] paused — review, then: praxis advance 2026-04-25-1430-7af2
```

Rules:

- `assistant_text` → wrap to terminal width, prefix ` ›`, summarize to first sentence if > 200 chars. Streaming deltas are coalesced for 100ms before printing.
- `tool_use` → `  › ToolName(brief)` only; never print tool input/output bodies
- `tool_result` → silent unless `ok=false` (then `  ✗ ToolName failed`)
- `error` → red, multi-line OK

`runDone` prints total tokens and USD plus a per-stage breakdown including each stage's session id.

## 9. Run State & Artifacts

```
<cwd>/.praxis/
  runs/
    2026-04-25-1430-7af2/
      state.json
      00-intent.txt
      01-clarify-assess.md
      02-implement-log.md
      03-commit.txt
```

`state.json`:

```json
{
  "runId": "2026-04-25-1430-7af2",
  "intent": "...",
  "startedAt": "2026-04-25T14:30:12Z",
  "currentStage": "implement",
  "cost": { "totalTokens": 0, "totalUsd": 0 },
  "stages": {
    "clarify-assess": {
      "status": "completed",
      "endedAt": "...",
      "stopReason": "end_turn",
      "sessionId": "sess_01ABC...",
      "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheCreate": 0 },
      "usd": 0
    },
    "implement": { "status": "running", "sessionId": "sess_01XYZ..." },
    "auto-commit": { "status": "pending" }
  }
}
```

`sessionId` is the SDK-assigned id, persisted for debugging (correlate with provider logs, run `claude --resume <id>` for the full transcript). Praxis does not resume SDK sessions across processes.

Add `.praxis/` to `.gitignore` automatically on first run (append, don't overwrite).

## 10. Pre-flight Checks

Before stage 1:

1. `git rev-parse --is-inside-work-tree` — fail if not a git repo
2. `git status --porcelain` — if non-empty and `--allow-dirty` was not passed, abort with the list of dirty files and a suggestion to commit, stash, or rerun with `--allow-dirty`. With `--allow-dirty`, the auto-commit stage will bundle pre-existing dirt into the run's commit (documented trade-off).
3. Append `.praxis/` to `.gitignore` if missing

No API key check (defer to SDK error if missing).

## 11. Error Handling & Resume

Per-stage failure modes:

- `timeoutMs` exceeded (`StageResult.cancelReason === "timeout"`) → stage fails
- `maxTurns` exceeded → stage fails
- `validate` fails after one corrective retry → stage fails (partial artifact still written to disk)
- SDK throws → stage fails

On failure: `state.json.stages[id].status = "failed"`, error written, exit 1. The harness never re-runs a stage automatically. The user has two recovery paths:

1. **`praxis advance <run-id>`** — advance past the failed stage using the on-disk artifact. The harness:
   - requires the failed stage's `outputArtifact` file to exist;
   - if the stage defines `validate`, re-runs it against the on-disk content; failure here aborts `advance` with the validator's reason;
   - on pass, marks the stage `completed` (using the file's contents as `finalText`, no token spend, no new `sessionId`) and proceeds with the rest of the workflow.
     This is the path for `clarify-assess` schema failures: hand-edit `01-clarify-assess.md` to satisfy §5.2's schema, then `advance`.
2. **Fresh `praxis run "<intent>"`** — for `implement` failures, where the working tree is in an unknown partial state. Reset the tree (`git stash` / `git reset`) first; `--allow-dirty` is not a substitute for inspecting what the half-run produced.

`praxis advance` has two distinct code paths with different log output:

- **paused** (after a `pauseAfter: true` stage): logs `resuming approved plan` and proceeds to the next stage. No validator re-check.
- **failed / cancelled**: logs `recovering <stage-id> from on-disk artifact; re-validating` and runs the validator (if defined) before proceeding. On validator failure, aborts with the validator's reason.

From any other status (`pending`, `running`, `completed`) `advance` is a no-op or error.

Cancellation: `SIGINT` aborts the in-flight stage via `AbortSignal` (`StageResult.cancelReason === "sigint"`), marks status `cancelled` (distinct from `failed`). Recovery is the same two paths above; `cancelled` is treated identically to `failed` by `advance`'s artifact-check logic.

## 12. Module Layout

```
src/
  cli.ts                 # commander entrypoint; selects Reporter
  config/
    schema.ts            # zod schemas for PraxisConfig + StageConfig
    defaults.ts          # built-in 3-stage workflow + clarify-assess validator
    prompts/
      clarify-assess.md
      implement.md
      auto-commit.md
  workflow/
    runner.ts            # orchestrates stage loop, pause/resume
    stage.ts             # executes one stage end-to-end via @anthropic-ai/claude-agent-sdk
    artifacts.ts         # writes finalText to disk; runs optional validator
    state.ts             # state.json read/write
  git/
    commit.ts            # git add -A + git commit
  ui/
    reporter.ts          # Reporter interface
    line-reporter.ts     # stdout impl
  index.ts
```

The `AgentAdapter` interface and `src/adapters/` directory are intentionally absent in v0.1; they arrive with Codex in v0.2.

## 13. Roadmap

- **v0.1 (MVP):** above spec.
- **v0.2 (likely-first):**
  - **Verify stage** between implement and auto-commit. Auto-detect a verification command from project files (`package.json` scripts, `Cargo.toml`, `pyproject.toml`, `Makefile`); user can override with `--verify <cmd>`. Fails the run on non-zero exit.
  - **User-exposed `model` and `thinkingEffort`** per stage. The internal `model` field already lands in v0.1's `StageConfig` with hardcoded defaults (Opus 4.7 for clarify-assess and implement, Haiku 4.5 for auto-commit); v0.2 surfaces it via config and adds `thinkingEffort`, defaulting to elevated effort for `implement`.
- **v0.2 (other):**
  - `AgentAdapter` interface (shape informed by both real backends). Codex adapter implementation.
  - Per-stage and per-run `maxUsd` cap.
  - Optional `--worktree` flag — run implement in `.praxis/worktrees/<run-id>/` and merge back on success.
  - In-process session forking if profiling shows a meaningful win over the path-based handoff.
  - `--branch` flag to opt into workflow branches.
  - Optional auto-stash for `--allow-dirty`.
  - `praxis show <run-id>` / `praxis list`.
  - Optional TUI reporter.
  - Interactive ≤3 clarifying-questions sub-step in `clarify-assess` (asked on stdin before plan emission). Pause gate becomes "approve plan" instead of "edit artifact".
