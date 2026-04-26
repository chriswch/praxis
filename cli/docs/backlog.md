# Backlog

Planned work, known gaps, and the v0.2 roadmap. Authoritative spec is [`../product.md`](../product.md); each item below cites the relevant section.

Items are organized by phase, then grouped by surface area. Mark items done by moving them out of this file and into [`features.md`](features.md) with a "Shipped" date.

---

## v0.1 (MVP) — to build

Nothing in the CLI subpackage is implemented yet. The list below is the full v0.1 build, sequenced so each chunk is testable on its own.

### 1. Project bootstrap

- [ ] Initialize `package.json` with the `praxis` bin entry and Node ≥ 20 engine constraint. (§3)
- [ ] Add TypeScript config targeting Node ≥ 20, no bundler. (§3)
- [ ] Add runtime deps: `@anthropic-ai/claude-agent-sdk`, `commander`, `zod`, `simple-git`. (§3)
- [ ] Scaffold the module layout from §12 (`src/cli.ts`, `src/config/`, `src/workflow/`, `src/git/`, `src/ui/`, `src/index.ts`).

### 2. Configuration & defaults

- [ ] Implement `StageConfig` and `PraxisConfig` zod schemas in `src/config/schema.ts`. (§6)
- [ ] Implement default 3-stage workflow in `src/config/defaults.ts` with pinned models: Opus 4.7 for `clarify-assess` and `implement`, Haiku 4.5 for `auto-commit`. (§6)
- [ ] Author stage system prompts as separate markdown files under `src/config/prompts/` so prompt iteration does not require recompile. (§6, §12)
- [ ] Implement template interpolation for `{{intent}}`, `{{runDir}}`, `{{artifacts.<id>.path}}`. (§6)
- [ ] Implement the `clarify-assess` validator (five H2 headings in fixed order; `## Acceptance` has at least one non-empty bullet). (§5.2, §6)

### 3. Stage execution

- [ ] Implement `runStage(config, ctx)` in `src/workflow/stage.ts` calling the Claude Agent SDK `query()` directly. No multi-adapter abstraction. (§7)
- [ ] Pass `settingSources: ["user", "project"]` and the per-stage `model` on every `query()` call. (§5, §7)
- [ ] Wire an `AbortController` shared by SIGINT and `timeoutMs`; preserve `cancelReason: "timeout" | "sigint"`. (§7, §11)
- [ ] Capture `StageResult` (finalText, turns, stopReason, sessionId, tokens, usd). (§7)
- [ ] On validator fail, send one corrective user message in the same `query()` stream; second failure is terminal. Always write the partial artifact to disk. (§5.2, §7)

### 4. Artifact + state plumbing

- [ ] `src/workflow/artifacts.ts` — write `finalText` verbatim to `<run-dir>/<outputArtifact>`; run optional validator. (§5, §6, §12)
- [ ] `src/workflow/state.ts` — read/write `state.json` per the §9 schema, including per-stage `sessionId`, `tokens`, `usd`, `stopReason`, `endedAt`.
- [ ] Run-dir layout under `<cwd>/.praxis/runs/<UTC-timestamp>-<short-id>/`. (§9)
- [ ] Append `.praxis/` to `.gitignore` on first run; do not overwrite. (§9, §10)

### 5. Workflow orchestration

- [ ] `src/workflow/runner.ts` — sequential stage loop honoring `pauseAfter` and `--no-pause`. (§5)
- [ ] Stage 0 intent capture writes `00-intent.txt` with the raw arg, no agent. (§5.1)
- [ ] Stage 1 `clarify-assess`: `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash]`, `timeoutMs: 900_000`, no `maxTurns`, `pauseAfter: true`. (§5.2)
- [ ] Stage 2 `implement`: `bypassPermissions`, all tools, `timeoutMs: 1_800_000`, no `maxTurns`, prompt references the clarify-assess artifact by path so the agent reads it itself. (§5.3)
- [ ] Stage 3 `auto-commit`: `permissionMode: "default"`, allowlist `[Bash]`, `timeoutMs: 300_000`. Skip with notice if `git status --porcelain` is empty. (§5.4)
- [ ] After auto-commit message generation, harness runs `git add -A` and `git commit -m <finalText>` directly (not via the agent). Write SHA + message to `03-commit.txt`. (§5.4)

### 6. CLI surface

- [ ] `praxis run "<intent>"` and `praxis advance <run-id>` via commander. (§4)
- [ ] Flags: `--no-pause`, `--allow-dirty`. (§4)
- [ ] Print run-id to stdout at start of every `run`. (§4)
- [ ] Surface the implement-stage risk warning in `praxis run --help` and the README. (§4)

### 7. Pre-flight checks

- [ ] Block when not inside a git work tree. (§10)
- [ ] Block on dirty working tree unless `--allow-dirty`; print the dirty list and remediation hints. (§10)
- [ ] Append `.praxis/` to `.gitignore` if missing. (§10)
- [ ] No API-key check; defer to SDK error. (§10)

### 8. Resume / advance

- [ ] `advance` distinguishes the **paused** path (no validator re-check, log `resuming approved plan`) from the **failed/cancelled** path (re-runs validator, log `recovering <stage-id> from on-disk artifact; re-validating`). (§11)
- [ ] `advance` requires the failed stage's `outputArtifact` to exist; on validator fail, abort with the validator's reason. (§11)
- [ ] On successful artifact re-validation, mark the stage `completed` using the file's contents as `finalText`; no token spend, no new sessionId. (§11)
- [ ] `advance` is a no-op or error from `pending`, `running`, or `completed`. (§11)
- [ ] SIGINT marks the in-flight stage `cancelled` (distinct from `failed`); `cancelled` is treated like `failed` by `advance`. (§11)

### 9. Reporter / UI

- [ ] `Reporter` interface in `src/ui/reporter.ts` with the §8 method set.
- [ ] `LineReporter` (stdout) implementation matching the §8 formatting rules:
  - assistant text wrapped to terminal width, prefixed ` ›`, summarized to first sentence if > 200 chars, deltas coalesced for 100ms before printing.
  - `tool_use` rendered as `  › ToolName(brief)`; never print tool input/output bodies.
  - `tool_result` silent on success, `  ✗ ToolName failed` on failure.
  - errors rendered in red, multi-line OK.
- [ ] `runDone` prints total tokens + USD plus a per-stage breakdown with each stage's `sessionId`. (§8)

### 10. Documentation

- [ ] README usage section reflects shipped flags and stages once each lands.
- [ ] Move each completed item from this file into `features.md` with a Shipped date and a behavior summary.

---

## Known gaps and trade-offs (carried from spec)

These are deliberate v0.1 decisions documented for awareness; promote any of them only when a specific need lands.

- **No worktree / sandbox for `implement`.** Runs against `process.cwd()` with `bypassPermissions`. Mitigation is the §4 README warning. (§2, §5.3)
- **`--allow-dirty` bundles pre-existing dirt into the auto-commit.** `git add -A` covers everything. (§5.4, §10)
- **No SDK session resumption across processes.** `sessionId` is a debug aid (`claude --resume <id>`); it is not used to continue a stage. (§5.5, §9)
- **No in-process session forking between stages.** Context flows via artifact files. (§2, §5.5)
- **No event log file.** Persisted `sessionId` plus `claude --resume` is the debug surface. (§2)
- **No `praxis retry`.** Recovery is `praxis advance` against a hand-fixed artifact, or a fresh `praxis run`. (§2, §11)
- **No user-supplied config file.** Defaults are hardcoded; the schema exists for future extensibility. (§2, §6)
- **No `list` / `show` commands.** (§2)
- **No per-stage / per-run USD cap.** (§2)
- **No per-stage model or thinking-effort knobs exposed.** `model` is in the internal schema but not user-facing. (§2, §6)
- **No TUI.** `Reporter` is abstracted so a TUI can be added without touching the runner. (§2, §8)
- **No PR creation, no verification stage, no MCP server, no Codex adapter in v0.1.** (§2)

---

## v0.2 roadmap (from spec §13)

### Likely-first

- **Verify stage** between `implement` and `auto-commit`. Auto-detect a verification command from project files (`package.json` scripts, `Cargo.toml`, `pyproject.toml`, `Makefile`); allow `--verify <cmd>` override. Non-zero exit fails the run.
- **Expose `model` and `thinkingEffort` per stage** via config. Default `thinkingEffort` to elevated for `implement`.

### Other v0.2

- `AgentAdapter` interface, shape informed by both Claude Agent SDK and Codex Agent SDK.
- Codex adapter implementation.
- Per-stage and per-run `maxUsd` cap.
- `--worktree` flag — run `implement` in `.praxis/worktrees/<run-id>/` and merge back on success.
- In-process session forking, only if profiling shows a meaningful win over the path-based handoff.
- `--branch` flag for workflow branches.
- Optional auto-stash for `--allow-dirty`.
- `praxis show <run-id>` and `praxis list`.
- Optional TUI reporter.
- Interactive ≤ 3 clarifying-questions sub-step in `clarify-assess` (asked on stdin before plan emission). Pause gate becomes "approve plan" instead of "edit artifact".
