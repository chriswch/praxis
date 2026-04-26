# Backlog

Planned work, known gaps, and the v0.2 roadmap. Authoritative spec is [`../product.md`](../product.md); each item below cites the relevant section.

Items are organized by phase, then grouped by surface area. Mark items done by moving them out of this file and into [`features.md`](features.md) with a "Shipped" date.

---

## v0.1 (MVP) — to build

S-001 (walking skeleton) shipped on 2026-04-26: package scaffold, `praxis run "<intent>"` writes `00-intent.txt` + `state.json`, run-id format pinned, DI seams (clock, RNG, `createQueryFn`) threaded through `runStage`. S-002 shipped on 2026-04-26: pre-flight, zod schemas, default 3-stage workflow, `clarify-assess` execution + validator + retry through the SDK seam, artifact write, per-stage state updates, pause hint, `--allow-dirty` flag. S-003 shipped on 2026-04-26: full §8 LineReporter (stage start/text/tool/error/stage end/paused/runDone) with 100ms streaming coalesce, tool-input briefs, Stage 0 synthesised line, `--no-pause` autopilot, Reporter on `Deps`, runner emits AgentEvents per assistant block. S-004 shipped on 2026-04-26: `praxis advance <run-id>` resumes paused runs and recovers failed/cancelled stages from on-disk artifacts (validator re-check, no token spend on the recovered stage, `stopReason: "recovered"`), `readState` structural validator, `Reporter.resuming?` + LineReporter §11 headlines, SIGINT-on-advance support, `--no-pause` honored on advance. S-005 shipped on 2026-04-26: implement + auto-commit stages execute end-to-end through the SDK seam, `02-implement-log.md` and `03-commit.txt` written verbatim, fresh sessionId + AbortController per stage, `bypassPermissions` paired with `allowDangerouslySkipPermissions: true`, `Deps.commit` hand-off seam wired (production stub prints stderr notice; real git body lands in S-006), implement timeout/SIGINT surfaces `stopReason: "timeout"`/`"sigint"` in state.json and skips auto-commit. S-006 shipped on 2026-04-26: real `git add -A` + `git commit -m` via the production `commit()` wrapper with `git status --porcelain` precheck (clean tree → skip with `stopReason: "skipped"`, no SDK call), SHA captured onto `state.stages["auto-commit"].commitSha`, `03-commit.txt` rewritten as `<sha>\n\n<message>\n` on success, commit failure flips the stage to `failed`/`stopReason: "commit_failed"` while keeping the agent message in `03-commit.txt` (no SHA prefix), `RunSummary.commitSha` plumbed through `summarize()` to the run-done line, S-005 stub stderr notice removed, `withTempRepo` configures local-scope git identity. The list below is the rest of the v0.1 build, sequenced so each chunk is testable on its own.

### 1. Project bootstrap

- [x] Initialize `package.json` with the `praxis` bin entry and Node ≥ 20 engine constraint. (§3) — S-001
- [x] Add TypeScript config targeting Node ≥ 20, no bundler. (§3) — S-001
- [x] Add runtime deps: `@anthropic-ai/claude-agent-sdk`, `zod`. (§3) — S-002 (`commander`, `simple-git` still deferred until the slices that need them)
- [x] Scaffold the module layout from §12 (`src/cli.ts`, `src/config/`, `src/workflow/`, `src/git/`, `src/ui/`, `src/index.ts`). (§12) — S-001

### 2. Configuration & defaults

- [x] Implement `StageConfig` and `PraxisConfig` zod schemas in `src/config/schema.ts`. (§6) — S-002
- [x] Implement default 3-stage workflow in `src/config/defaults.ts` with pinned models: Opus 4.7 for `clarify-assess` and `implement`, Haiku 4.5 for `auto-commit`. (§6) — S-002
- [x] Author stage system prompts as separate markdown files under `src/config/prompts/` so prompt iteration does not require recompile. (§6, §12) — S-002
- [x] Implement template interpolation for `{{intent}}`, `{{runDir}}`, `{{artifacts.<id>.path}}`. (§6) — S-002
- [x] Implement the `clarify-assess` validator (five H2 headings in fixed order; `## Acceptance` has at least one non-empty bullet). (§5.2, §6) — S-002

### 3. Stage execution

- [x] Implement `runStage(config, ctx)` in `src/workflow/stage.ts` calling the Claude Agent SDK `query()` directly. No multi-adapter abstraction. (§7) — S-002 (clarify-assess only; implement/auto-commit configurations land but execution is S-005/S-006)
- [x] Pass `settingSources: ["user", "project"]` and the per-stage `model` on every `query()` call. (§5, §7) — S-002
- [x] Wire an `AbortController` shared by SIGINT and `timeoutMs`; preserve `cancelReason: "timeout" | "sigint"`. (§7, §11) — S-005 (cancelReason mirrored into stopReason for state.json; covered for implement timeout + SIGINT)
- [x] Capture `StageResult` (finalText, turns, stopReason, sessionId, tokens, usd). (§7) — S-002
- [x] On validator fail, send one corrective user message in the same `query()` stream; second failure is terminal. Always write the partial artifact to disk. (§5.2, §7) — S-002

### 4. Artifact + state plumbing

- [x] `src/workflow/artifacts.ts` — write `finalText` verbatim to `<run-dir>/<outputArtifact>`; run optional validator. (§5, §6, §12) — S-002
- [x] `src/workflow/state.ts` — read/write `state.json` per the §9 schema, including per-stage `sessionId`, `tokens`, `usd`, `stopReason`, `endedAt`. — write path shipped in S-002; read path (`readState`) shipped in S-004
- [x] Run-dir layout under `<cwd>/.praxis/runs/<UTC-timestamp>-<short-id>/`. (§9) — S-001
- [x] Append `.praxis/` to `.gitignore` on first run; do not overwrite. (§9, §10) — S-002

### 5. Workflow orchestration

- [x] `src/workflow/runner.ts` — sequential stage loop honoring `pauseAfter` and `--no-pause`. (§5) — `pauseAfter` honored in S-002; `--no-pause` shipped in S-003
- [x] Stage 0 intent capture writes `00-intent.txt` with the raw arg, no agent. (§5.1) — S-001
- [x] Stage 1 `clarify-assess`: `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash]`, `timeoutMs: 900_000`, no `maxTurns`, `pauseAfter: true`. (§5.2) — S-002
- [x] Stage 2 `implement`: `bypassPermissions`, all tools, `timeoutMs: 1_800_000`, no `maxTurns`, prompt references the clarify-assess artifact by path so the agent reads it itself. (§5.3) — S-005 (execution wired via SDK seam; `allowDangerouslySkipPermissions: true` paired with `bypassPermissions`; verbatim `02-implement-log.md`)
- [x] Stage 3 `auto-commit`: `permissionMode: "default"`, allowlist `[Bash]`, `timeoutMs: 300_000`. Skip with notice if `git status --porcelain` is empty. (§5.4) — S-005 wired execution + verbatim `03-commit.txt`; S-006 added the `git status --porcelain` pre-check at the runner (skips the SDK call entirely; `stopReason: "skipped"`).
- [x] After auto-commit message generation, harness runs `git add -A` and `git commit -m <finalText>` directly (not via the agent). Write SHA + message to `03-commit.txt`. (§5.4) — S-006 (production `commit()` runs real `git add -A` + `git commit -m`; SHA captured on `state.commitSha` and prepended onto `03-commit.txt` as `<sha>\n\n<message>\n`).

### 6. CLI surface

- [ ] `praxis run "<intent>"` and `praxis advance <run-id>` via commander. (§4) — manual `run` parsing shipped in S-001/S-002; manual `advance` parsing shipped in S-004; commander adoption still pending
- [x] Flags: `--allow-dirty` (S-002), `--no-pause` (S-003). (§4)
- [x] Print run-id to stdout at start of every `run`. (§4) — S-001
- [ ] Surface the implement-stage risk warning in `praxis run --help` and the README. (§4) — README warning shipped in S-001; `--help` text pending the commander adoption

### 7. Pre-flight checks

- [x] Block when not inside a git work tree. (§10) — S-002
- [x] Block on dirty working tree unless `--allow-dirty`; print the dirty list and remediation hints. (§10) — S-002
- [x] Append `.praxis/` to `.gitignore` if missing. (§10) — S-002
- [ ] No API-key check; defer to SDK error. (§10) — confirmed by absence; no work needed

### 8. Resume / advance

- [x] `advance` distinguishes the **paused** path (no validator re-check, log `resuming approved plan`) from the **failed/cancelled** path (re-runs validator, log `recovering <stage-id> from on-disk artifact; re-validating`). (§11) — S-004
- [x] `advance` requires the failed stage's `outputArtifact` to exist; on validator fail, abort with the validator's reason. (§11) — S-004
- [x] On successful artifact re-validation, mark the stage `completed` using the file's contents as `finalText`; no token spend, no new sessionId. (§11) — S-004 (`stopReason: "recovered"`; sessionId/tokens/usd preserved from prior run)
- [x] `advance` is a no-op or error from `pending`, `running`, or `completed`. (§11) — S-004 (`pending` with no paused predecessor and `running` → exit 1 "not in a resumable state"; fully `completed` → exit 1 "already complete")
- [x] SIGINT marks the in-flight stage `cancelled` (distinct from `failed`); `cancelled` is treated like `failed` by `advance`. (§11) — S-004 (SIGINT during a resumed stage marks it cancelled and runDone fires with status=cancelled; AC-7 cancelled-as-failed coverage)

### 9. Reporter / UI

- [x] `Reporter` interface in `src/ui/reporter.ts` with the §8 method set. — S-001 (no-op `LineReporter` skeleton in place)
- [x] `LineReporter` (stdout) implementation matching the §8 formatting rules:
  - assistant text wrapped to terminal width, prefixed ` ›`, summarized to first sentence if > 200 chars, deltas coalesced for 100ms before printing. — S-003
  - `tool_use` rendered as `  › ToolName(brief)`; never print tool input/output bodies. — S-003
  - `tool_result` silent on success, `  ✗ ToolName failed` on failure. — S-003
  - errors rendered in red, multi-line OK. — S-003
- [x] `runDone` prints total tokens + USD plus a per-stage breakdown with each stage's `sessionId`. (§8) — S-003

### 10. Documentation

- [ ] README usage section reflects shipped flags and stages once each lands. — S-001 status banner + Develop snippet shipped; flag/stage docs pending
- [ ] Move each completed item from this file into `features.md` with a Shipped date and a behavior summary.

### 11. Real-SDK smoke (S-007)

- [x] Document the smoke procedure in README (prerequisites, one-time setup, smoke procedure, what-to-verify checklist, smoke variants). — S-007 (docs only; awaiting one real-SDK run by the maintainer to close the slice and ship v0.1).
- [ ] Execute the smoke against the real SDK (one happy-path run + at least one variant). Record run-ids and USD spent in the v0.1 release notes. — requires API credit; pending maintainer.

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
