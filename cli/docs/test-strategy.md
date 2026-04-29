# Test strategy

How we test Praxis CLI. Read this before adding or reviewing any test.

> **TL;DR** — Sociable tests, real filesystem, real `git`, scripted SDK. Cover only behavior a user (or a downstream stage) can observe. Add a test when a contract changes; don't add one for an internal helper.

---

## 1. Sociable, not solitary

A **sociable** test exercises a unit together with its real collaborators. A **solitary** test replaces every collaborator with a mock or stub. We default to sociable.

- **Use the real thing** for: filesystem, `child_process`, `git`, our own modules (`runner`, `stage`, `state`, `validator`, `preflight`, `commit`, reporters, config defaults).
- **Stub at the process boundary only** — three seams, all already factored into `Deps` (`src/workflow/stage.ts`):
  - `createQueryFn` — the Claude Agent SDK. Tests use `scriptedQuery` / `recordingScriptedQuery` from `tests/support/scripted-query.ts`. Never call the real SDK from `npm test`.
  - `clock` — pinned `Date` for deterministic run-ids and `startedAt`.
  - `rng` — pinned bytes for the run-id suffix.
  - `commit` — pinned in unit tests when the test is not about commit; left real in tests that assert the commit shape.
- **Do not introduce new mocks.** If a test feels hard to write without one, the seam is wrong — fix the seam, don't mock around it.

Why: mocked unit tests pass while the wired-together system breaks. Praxis's correctness lives in the choreography between stages, the filesystem, and `git`. Mocking those out tests nothing.

---

## 2. What counts as "critical behavior"

Test only what a **user** or a **downstream stage** can observe. Skip everything else.

**Critical (test it):**

- CLI surface — exit code, stderr message, presence/absence of `.praxis/` after the call.
- Pre-flight gates — non-git dir, dirty tree, empty/missing intent, unknown flags.
- Artifact contracts — file paths, H2 schemas for `01-clarify-assess.md` and `04-code-review.md`, the SHA-prefix shape of `06-commit.txt`, the verbatim-finalText rule for `02-sketching-design.md` / `03-implement-log.md` / `05-code-improve.md`.
- `state.json` invariants — status transitions, `sessionId` capture, `tokens`/`usd` accumulation, `cost.totalTokens`/`cost.totalUsd` aggregation, `retryAttempts` increment, `stopReason` values.
- Stage chaining — pause-after gates, `--no-pause` autopilot, skip propagation when `code-reviewing` returns `skip-improve`, clean-tree skip for `auto-commit`.
- Recovery — `praxis advance` from a paused stage, from a failed/cancelled `clarify-assess` or `code-reviewing`; `praxis retry` for `code-improving`; the "use retry instead" hint when `advance` hits a failed `code-improving`.
- Cancellation — SIGINT marks the in-flight stage `cancelled`, downstream stages do not run, partial artifact persists.
- Commit invariants — the SHA written to `06-commit.txt` matches `git log -1 --pretty=%H` and `state.stages["auto-commit"].commitSha`; `.gitignore` ends with a single `.praxis/` line (idempotent).
- Reporter output — only the lines documented in the smoke checklist (README §What to verify).

**Not critical (do not test):**

- Internal helper signatures, private types, intermediate data shapes.
- Wording of agent-facing prompts (covered by the smoke run).
- Performance, timing, log-line ordering beyond what the user sees.
- Anything that would force a test rewrite on a refactor that does not change a user-observable contract.

If you cannot point at a user-observable contract a test defends, delete the test.

---

## 3. Where tests go

| Layer | Directory | Stubs | When to use |
|---|---|---|---|
| **Unit** | `tests/<module>/` (e.g. `tests/git/`, `tests/ui/`, `tests/config/`) | None — real I/O against tmp dirs | Pure, single-module behavior with no SDK involvement (commit, status, line formatter, defaults). |
| **Workflow (sociable)** | `tests/workflow/` | `createQueryFn` scripted, `clock`/`rng` pinned, `commit` pinned only when unrelated | Stage choreography, validator retries, state writes, artifact emission, cancellation, skip propagation. **This is the default layer for new behavior.** |
| **E2E (CLI)** | `tests/e2e/` | Spawned via `runCli` — real Node process, scripted SDK injected through env/test bin | Exit codes, stderr text, flag parsing, pre-flight side effects. One test per CLI-surface contract. |
| **Smoke (manual, paid)** | README §"Smoke run against the real SDK" | None — real SDK, real money | Run before tagging a release. Not part of `npm test`. |

Rule of thumb: **start at the workflow layer.** Drop to unit only for genuinely pure modules. Add an e2e only when the contract is a property of the spawned process (exit code, stderr, no-side-effect-on-failure).

---

## 4. Test shape

Every workflow / e2e test follows the same skeleton:

```ts
await withTempRepo(async ({ dir }) => {
  // 1. Arrange — pin clock/rng, build a scripted SDK, seed any pre-existing
  //    files the scenario requires.
  // 2. Act — call runWorkflow / runStage / runCli once.
  // 3. Assert — read state.json, artifact files, and `git log` directly.
  //    Assert on user-observable outputs only.
});
```

- Use `withTempRepo` (`tests/support/tmp-repo.ts`) for any test that touches `git`. It pins local-scope `user.email` / `user.name` / `commit.gpgsign=false` so commits work on bare CI and laptops without global git config.
- Use `scriptedQuery` for happy paths and `recordingScriptedQuery` when you need to assert on what was sent to the SDK (system prompt, allowed tools, resume + initialUserPrompt for retry).
- Pin `clock` to a fixed `Date` and `rng` to a fixed `Uint8Array` whenever the test asserts on a run-id or `startedAt`. Otherwise either is fine.
- Read `state.json` and artifact files with `readFileSync`. Do not import private serialization helpers.
- For commit assertions, shell out to `git log` / `git show` via `spawnSync`. Treat git as a black box.

---

## 5. Adding a test for new behavior

Before writing the test, write down two things:

1. **The user-observable contract.** One sentence. e.g. *"`praxis advance` on a failed `code-improving` exits 1 with a `praxis retry` hint and does not modify `state.json`."* If you cannot write this sentence, the behavior probably is not critical — stop.
2. **The layer.** Workflow if it touches stage choreography. E2E if it is about the CLI process surface. Unit only for pure modules.

Then:

- Place the test in the matching directory.
- Reuse `withTempRepo`, `scriptedQuery`, `runCli` — do not introduce parallel helpers.
- Assert on the contract from step 1, nothing more. No "while we're here" assertions on internal shapes.
- Run `npm test` locally. If the test passes against the current code without any production change, the test does not defend the contract — rework it.

---

## 6. Reviewing a test (human or AI)

Reject the test if any of these are true:

- It mocks something other than `createQueryFn`, `clock`, `rng`, or `commit`.
- It asserts on a private type, internal helper return value, or implementation detail.
- It asserts on log lines other than the ones documented in README §What to verify.
- It would fail under a refactor that preserves all user-observable behavior.
- It duplicates coverage already provided by an existing workflow- or e2e-layer test.
- The contract it defends is not in §2 above and the PR does not extend §2.

Accept the test if it adds or tightens a contract from §2, uses only the four allowed seams, and reads like the skeleton in §4.

---

## 7. What this strategy deliberately does not do

- **No mocking framework.** vitest is the runner; we do not use `vi.mock` against our own modules.
- **No snapshot tests** for state.json or artifacts. Snapshots rot silently and hide intent. Assert on the specific fields a contract requires.
- **No coverage threshold.** Coverage reports are fine to look at; they are not a gate. Critical-behavior coverage matters; line coverage does not.
- **No real-SDK tests in `npm test`.** The smoke run is manual and tracked in the README.
