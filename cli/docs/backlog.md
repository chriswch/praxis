# Backlog

Open work, known gaps, and the future roadmap. Shipped behavior is described in [`features.md`](features.md).

When an item lands, remove it from this file (don't strike-through) — `features.md` is where shipped behavior is described.

---

## Pending

### CLI surface (commander adoption)

- [ ] Adopt `commander` for `praxis run "<intent>"`, `praxis advance <run-id>`, and `praxis retry <run-id>`. Argv parsing is hand-rolled today; it works and rejects unknown flags before any disk write, but `--help` text is not generated.
- [ ] Once commander lands, surface the driving-tdd / code-improving stage risk warning verbatim in `praxis run --help` (currently only in the README).

### Real-SDK smoke

- [ ] Run at least one of the README's [smoke variants](../README.md#smoke-variants-worth-running-once) — clean-tree skip, validator-failure recovery, `--allow-dirty` bundling, or SIGINT during driving-tdd — to exercise the paths the happy-path smoke did not. The happy path is already validated (see `features.md` "End-to-end validation").

### Polish (deferred from review)

- [ ] Append a remediation hint to `commit_failed` errors when git's stderr matches the "missing identity" signature (`Author identity unknown` / `Please tell me who you are`). Today the raw git message is surfaced — actionable but not Praxis-curated. (Code-review L-2 from the auto-commit slice.)

### Code-review/improve milestone follow-ups

- [ ] Plugin pre-flight check — gate the run on `praxis` plugin presence so failures surface before any spend (instead of as a `code-reviewing` validator failure mid-run).
- [ ] Promote `praxis retry` to other stages on demand — currently scoped to `code-improving`.
- [ ] Annotate `runDone` per-stage rows with `retried Nx` when `retryAttempts > 0`.
- [ ] Promote decision parsing to a typed validator return shape (`{ ok, decision }`) once a second decision-driven stage lands.
- [ ] Stage hand-off keyed on `stage.id === AUTO_COMMIT_ID` in the runner — promote to a typed `postStage` field on `StageConfig`. The case strengthens with two new downstream stages now in the workflow. (Carried from S-005/S-006 reviews.)

---

## Known gaps and trade-offs

These are deliberate current-scope decisions documented for awareness; promote any of them only when a specific need lands.

- **No worktree / sandbox for `driving-tdd` / `code-improving`.** Both run against `process.cwd()` with `bypassPermissions`. Mitigation is the README warning.
- **`--allow-dirty` bundles pre-existing dirt into the auto-commit.** `git add -A` covers everything.
- **Cross-process SDK session resumption is scoped to `praxis retry` for `code-improving`.** Other stages remain non-resumable; their `sessionId` is debug-only (`claude --resume <id>`).
- **No in-process session forking between stages.** Context flows via artifact files.
- **No event log file.** Persisted `sessionId` plus `claude --resume` is the debug surface.
- **No user-supplied config file.** Defaults are hardcoded; the schema exists for future extensibility.
- **No `list` / `show` commands.**
- **No per-stage / per-run USD cap.**
- **No per-stage model or thinking-effort knobs exposed.** `model` is in the internal schema but not user-facing.
- **No TUI.** `Reporter` is abstracted so a TUI can be added without touching the runner.
- **No PR creation, no verification stage, no MCP server, no Codex adapter.**

---

## Tech debt (no scheduled milestone — refactor when triggered)

### Two-path prompt loading via `existsSync`

**Where:** `src/workflow/stage.ts` — `PROMPTS_DIR` is computed by trying `<here>/config/prompts` first (the tsdown-bundled layout, where `<here>` is `dist/`) and falling back to `<here>/../config/prompts` (the source-via-tsx layout, where `<here>` is `src/workflow/`). The fallback exists because the bundle collapses `src/workflow/stage.js` (depth 2) into `dist/cli.js` (depth 1).

**Why it's debt:** A workaround, not a best practice. Works today because we have exactly two known layouts; rots the day a third arrives (e.g., Bun `--compile` standalone binary, vendored as a sub-dep, or a different bundler output structure). Code reviews call this out as "the build system has the wrong shape."

**Modern (2026/04) best practice:** Inline assets via the bundler's text loader. Make prompts string constants in the bundle so there's no runtime fs at all and no path resolution.

```ts
// Source: import the .md as a text constant
import clarifyAssessSystemPrompt from "../config/prompts/clarify-assess.md";

// tsdown.config.ts
export default defineConfig({
  loader: { ".md": "text" },
  // ... drop the `copy` block
});
```

Three runtimes have to align for this to work end-to-end:

- **tsdown** (production bundle): `loader: { ".md": "text" }` (already in the API).
- **vitest** (test runner, vite-based): use `?raw` import suffix or a tiny inline plugin to map `.md` → text export.
- **tsx** (the e2e tests that spawn `src/cli.ts` directly): a Node loader hook OR `?raw` suffix.

Plus an ambient `*.md` module declaration so TypeScript resolves the imports.

**Trigger condition for the refactor:** any of —

- A second asset type joins prompts (SQL migrations, HTML templates, localization JSON, etc.).
- TUI work introduces JSX templates or static React components that have the same shape problem.
- Praxis ships a second distribution channel (Bun `--compile` binary, Docker image with relocated layout) and the `existsSync` fallback breaks.
- A user reports the prompts not loading on a non-standard install layout.

Until one of those triggers, the existing helper is small (~5 lines), tested, and honest about the two layouts. Defer.

---

## Roadmap (future)

### Likely-first

- **Verify stage** between `driving-tdd` and `auto-commit`. Auto-detect a verification command from project files (`package.json` scripts, `Cargo.toml`, `pyproject.toml`, `Makefile`); allow `--verify <cmd>` override. Non-zero exit fails the run.
- **Expose `model` and `thinkingEffort` per stage** via config. Default `thinkingEffort` to elevated for `driving-tdd`.

### Other

- `AgentAdapter` interface, shape informed by both Claude Agent SDK and Codex Agent SDK.
- Codex adapter implementation.
- Per-stage and per-run `maxUsd` cap.
- `--worktree` flag — run `driving-tdd` in `.praxis/worktrees/<run-id>/` and merge back on success.
- In-process session forking, only if profiling shows a meaningful win over the path-based handoff.
- `--branch` flag for workflow branches.
- Optional auto-stash for `--allow-dirty`.
- `praxis show <run-id>` and `praxis list`.
- `praxis chain show <chain-id>` and `praxis chain list` (today: read `.praxis/chains/<id>.json` directly).
- `praxis chain cancel` (today: stop running `advance` / `retry` and the chain sits at `in_progress` or `aborted`).
- Per-chain cost cap.
- Cross-CLI-session chain resume when no run is paused (today: re-run `praxis run --iterations <remaining> "<intent>"` manually).
- Convergence-style iteration (re-assessing intent per iteration) — separate feature, not a flag on `--iterations`.
- Optional TUI reporter.
- Interactive ≤ 3 clarifying-questions sub-step in `clarify-assess` (asked on stdin before plan emission). Pause gate becomes "approve plan" instead of "edit artifact".
