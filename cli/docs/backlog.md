# Backlog

Open work, known gaps, and the v0.2 roadmap. Authoritative spec is [`../product.md`](../product.md). Shipped behavior is described in [`features.md`](features.md).

When an item lands, remove it from this file (don't strike-through) — `features.md` is where shipped behavior is described.

---

## v0.1 — pending

### CLI surface (commander adoption)

- [ ] Adopt `commander` for `praxis run "<intent>"` and `praxis advance <run-id>`. Argv parsing is hand-rolled today; it works and rejects unknown flags before any disk write, but `--help` text is not generated. (§4)
- [ ] Once commander lands, surface the implement-stage risk warning verbatim in `praxis run --help` (currently only in the README). (§4)

### Real-SDK smoke

- [ ] Run at least one of the README's [smoke variants](../README.md#smoke-variants-worth-running-once) — clean-tree skip, validator-failure recovery, `--allow-dirty` bundling, or SIGINT during implement — to exercise the paths the happy-path smoke did not. The happy path is already validated (see `features.md` "End-to-end validation").

### Polish (deferred from review)

- [ ] Append a remediation hint to `commit_failed` errors when git's stderr matches the "missing identity" signature (`Author identity unknown` / `Please tell me who you are`). Today the raw git message is surfaced — actionable but not Praxis-curated. (Code-review L-2 from the auto-commit slice.)
- [ ] Consolidate `isWorkingTreeClean` — the `git status --porcelain` check is implemented twice (in `src/git/commit.ts` for the `commit()` self-check, and in `src/workflow/runner.ts` for the auto-commit pre-check). Single source of truth. (Code-review L-3 from the auto-commit slice.)

---

## Known gaps and trade-offs (carried from spec)

These are deliberate v0.1 decisions documented for awareness; promote any of them only when a specific need lands.

- **No worktree / sandbox for `implement`.** Runs against `process.cwd()` with `bypassPermissions`. Mitigation is the README warning. (§2, §5.3)
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
- **Stage hand-off is keyed on `stage.id === AUTO_COMMIT_ID`** in the runner (a constant exported from `defaults.ts`, locked by a regression test). When v0.2 introduces user-supplied workflow config, promote this to a typed `postStage` field on `StageConfig`. (Carried from S-005/S-006 reviews.)

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
