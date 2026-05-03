# Spec — `praxis run --iterations <N>`

Repeat the same intent across N back-to-back runs ("a chain"), each iteration being a full 7-stage workflow on a tree just committed by its predecessor.

> **Status:** proposed; not yet implemented. See `docs/backlog.md` once a slice is scheduled.

---

## 1. CLI surface

```
praxis run [--allow-dirty] [--no-pause] --iterations <N> "<intent>"
```

- `<N>` is a positive integer (`N >= 1`); reject `0`, negatives, non-integers.
- `--iterations 1` is accepted and creates a chain ledger (uniformity with N>1).
- Flag composes with existing `--allow-dirty` / `--no-pause`; both are carried onto iter 2+ (`--allow-dirty` is a no-op when the tree is clean post-commit, but the flag is still propagated).
- `advance` and `retry` get **no new flag** — they discover chain membership via `state.json.chainId`.

## 2. Chain ledger

**Path:** `.praxis/chains/<chain-id>.json`
**`<chain-id>`** is generated independently of any iteration's run-id, using the same `YYYY-MM-DD-HHMM-<hex4>` format as run-ids (e.g., `2026-05-02-1430-9f3c`). Generated once at chain creation; never reused by a run-id.

**Schema:**

```jsonc
{
  "chainId": "2026-05-02-1430-9f3c",
  "intent": "<verbatim>",
  "iterationsTotal": 5,
  "iterationsCompleted": 2,
  "flags": { "allowDirty": false, "noPause": false },
  "status": "in_progress" | "completed" | "completed-early" | "aborted" | "cancelled",
  "createdAt": "2026-05-02T14:30:00Z",
  "updatedAt": "2026-05-02T14:42:13Z",
  "iterations": [
    { "index": 1, "runId": "2026-05-02-1430-a1b2", "status": "completed", "commitSha": "<40-char>" },
    { "index": 2, "runId": "2026-05-02-1442-c3d4", "status": "completed", "commitSha": "<40-char>" },
    { "index": 3, "runId": "2026-05-02-1455-e5f6", "status": "running" }
  ]
}
```

The ledger is **append-mostly** — each iteration entry is added when its run starts, mutated on terminal status, and never deleted.

## 3. `state.json` additions

Each run that is part of a chain stamps two new fields onto its `state.json`:

```ts
chainId?: string;        // matches chain ledger; omitted for non-chain runs
iterationIndex?: number; // 1-based, matches ledger.iterations[].index
```

All existing fields and behaviors are unchanged.

## 4. Lifecycle

### Iteration boundaries

- Iteration K's `auto-commit` SHA becomes the baseline for iteration K+1 — just `currentHead(cwd)` at iter K+1's `runWorkflow` entry, the same path the first iteration uses today.
- Iter 2+ **does not call `runPreflight`** — the tree is clean by construction (post-commit) and `.gitignore` was already touched up by iter 1.
- Each iteration gets a fresh run-id and `.praxis/runs/<id>/` directory.

### Auto-launch (single CLI process)

- Inside `praxis run` / `advance` / `retry`, after a run reaches a non-paused terminal state (`completed`), the process checks `state.chainId`. If the chain has remaining iterations and is still `in_progress`, the process immediately launches the next iteration in the same process via the same `runWorkflow` entry point used for iter 1.
- Pause within an iteration → process exits as today; chain status remains `in_progress`. The user runs `praxis advance <paused-run-id>`; that advance finishes the run AND auto-launches the next iteration.

### Termination (chain status)

| Trigger | Chain status | Process exit |
|---|---|---|
| Iteration N completes successfully (commit lands) | `completed` | 0 |
| Any iteration's auto-commit cascade-skips (no driving-tdd commits) | `completed-early` | 0 |
| Any iteration ends `failed` (validator, timeout, commit_failed, etc.) | `aborted` | 1 |
| SIGINT mid-iteration | `cancelled` | 1 (SIGINT-style) |
| Iteration ends `cancelled` (non-SIGINT — currently same path as SIGINT) | `cancelled` | 1 |

After a chain terminates, the ledger's `status` and `updatedAt` are written; iter K's run-level state is independent and already persisted.

### Failure / abandonment

- A failed/cancelled iteration's run can still be recovered with `praxis advance` or `praxis retry`. On successful recovery, the run flips to `completed`; the chain auto-launches the next iteration just like the happy path. (This softens "abort the chain" — the chain is `aborted` only when the user gives up. Documented in CLI help.)
- A user can also stop running `advance` — the ledger sits at `aborted` (or `in_progress` if the run was paused, not failed). No `praxis chain cancel` in v1.

## 5. Reporter

One header line per iteration, **before** the iteration's first stage line:

```
praxis: [chain 9f3c · iteration 2/5] starting run 2026-05-02-1442-c3d4
[1/7 clarify-assess] starting…
…
```

- Banner uses the last 4 hex chars of the chain-id (`9f3c`), not the full id.
- For non-chain runs (no `--iterations` flag), no header is emitted — backwards compatible.
- `runDone` line is unchanged; the chain is summarized only in the ledger.
- When a chain terminates, emit one final line:

```
praxis: [chain 9f3c] <status> after <K>/<N> iterations
```

## 6. Acceptance criteria

**Surface & validation**

- AC-1 `praxis run --iterations 0 "..."` exits 1 with `iterations must be a positive integer`.
- AC-2 `praxis run --iterations 1 "..."` writes a chain ledger with `iterationsTotal: 1` and proceeds normally; on success the ledger ends `status: "completed"`.
- AC-3 `--iterations` rejects non-integer / missing values with the same error shape as other unknown-flag failures.

**Ledger**

- AC-4 The chain-id is generated independently of any iteration's run-id (no equality required) and is unique across the `.praxis/chains/` and `.praxis/runs/` namespaces.
- AC-5 The ledger is created **after** iter 1's `runDir` exists but **before** iter 1's first stage runs, so a SIGINT during iter 1's clarify-assess leaves a ledger with one `iterations[0]` entry in `running`.
- AC-6 On successful chain termination, `iterationsCompleted == iterationsTotal` (or less, with status `completed-early`); `updatedAt > createdAt`.

**State**

- AC-7 Every iteration's `state.json` has `chainId` and `iterationIndex` fields; the chainId matches the ledger; `iterationIndex` is 1-based and monotonic.

**Auto-launch**

- AC-8 With `--no-pause`, a clean N=3 run produces 3 distinct run-ids on stdout (one per line, in order) and a single ledger with `status: "completed"` and 3 entries.
- AC-9 With pauses on, a paused iter 1 leaves the chain `in_progress`; `praxis advance <iter-1-id>` completes iter 1 and auto-launches iter 2 (which, if it pauses, leaves the chain `in_progress` with two entries).

**Termination**

- AC-10 If iter 2 of 5 fails, the chain ledger's `status` is `aborted` after the failure is persisted; iters 3–5 never start.
- AC-11 If iter 2 of 5 cascade-skips (no driving-tdd commits), the chain's `status` is `completed-early`; iter 2's run is `completed` (with cascading `stopReason: "skipped"` on the trailing four stages); iters 3–5 never start.
- AC-12 SIGINT during iter 2 sets the chain's `status` to `cancelled`, the run's status to `cancelled`, and exits 1.

**Recovery interaction**

- AC-13 `praxis advance` on a failed iter K's run-id flips the chain back to `in_progress` on successful recovery (only when the recovery itself succeeds — failed recovery leaves the chain `aborted`).
- AC-14 `praxis retry` on a failed `code-improving` in iter K behaves identically — successful retry resumes the chain.

**Pre-flight**

- AC-15 Iter 2+ does NOT call `runPreflight` and does NOT touch `.gitignore` (already done by iter 1 via `runWorkflow`'s normal path).

**Reporter**

- AC-16 Each iteration emits exactly one `praxis: [chain <short> · iteration <K>/<N>] starting run <run-id>` line before its first stage.
- AC-17 A chain's terminal status emits one final line: `praxis: [chain <short>] <status> after <K>/<N> iterations`.
- AC-18 Non-chain runs (no `--iterations`) emit no chain banner — no regression.

**Carry-forward of flags**

- AC-19 `--allow-dirty` set at chain start is recorded in the ledger's `flags` and inherited by every subsequent iteration's `runWorkflow` call (no-op when tree is clean).
- AC-20 `--no-pause` likewise inherited.

## 7. Implementation slices (suggested)

- **S-1.** Chain ledger primitive — schema, read/write helpers in `src/workflow/chain.ts`. No behavior wired up. Validates round-trip and concurrent-write protection.
- **S-2.** `--iterations` flag parsing on `run`; single-iteration chain (N=1) writes ledger with `status: "completed"` end-to-end.
- **S-3.** Multi-iteration auto-launch on `run` (autopilot; relies on the `--no-pause` path internally, even with pauses off). Owns `completed-early` cascade-skip detection — the loop reads each iteration's ledger entry post-runner and breaks when `commitSha` is absent.
- **S-4.** Pause + `advance` chain awareness — `state.json.chainId` round-trips; advance auto-launches next iteration.
- **S-5.** `retry` chain awareness — symmetric to S-4.
- **S-6.** Termination paths — failure (`aborted`) and SIGINT (`cancelled`) — each ending the ledger correctly. (`completed-early` cascade-skip is owned by S-3.)
- **S-7.** Reporter banner + chain-end line.

## 8. Out of scope (v1)

- `praxis chain show <chain-id>` / `praxis chain list` — read the JSON.
- `praxis chain cancel` — stop running `advance`; status sits at `in_progress` or `aborted`.
- Per-chain cost cap.
- Resuming a chain across CLI sessions when no run is paused (rule: re-run `praxis run --iterations <remaining> "<intent>"` manually).
- Convergence-style iteration (re-assessing intent per iteration). Different feature.

## 9. Risks / open notes

- **Iter 2 on top of iter 1's commit:** the agent sees the intent "already done" and either cascade-skips (handled, AC-11) or piles on. Document in `--iterations` help text: *"Each iteration sees the previous iteration's commit. Use intents that naturally produce multiple commits, or expect early termination via cascade-skip."*
- **Concurrent ledger writes:** within one CLI process, only one iteration runs at a time, so a simple read-modify-write is safe. If an external user hand-edits while the CLI runs, all bets are off — same as `state.json` today.
