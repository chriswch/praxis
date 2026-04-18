# Praxis TypeScript CLI Final Product Spec

Status: Proposed v1

This document consolidates the three April 15 architecture notes into one
implementation-ready product spec for the new Praxis CLI.

## Product Decision

- Praxis is a new TypeScript product, implemented as a CLI with
  Commander.js.
- It is not a wrapper around the existing Python Praxis CLI and should not
  depend on that CLI for workflow semantics, routing, or durable state.
- Codex and Claude are integrated through their TypeScript agent SDKs first.
  Any headless CLI fallback is an adapter detail, not the product model.
- The `praxis` CLI is the authoritative entrypoint. Skills, slash commands,
  and provider-native wrappers are convenience launch surfaces only.
- Workflow truth lives in durable Praxis state and artifacts under `.praxis/`,
  not in Codex or Claude transcripts.
- v1 is strictly serial at the ownership level: one owning worker at a time
  per run.

## Goals

- Provide a CLI-first orchestrator for long-running software-development
  workflows.
- Support Codex and Claude through one provider-neutral runtime model.
- Support manual checkpoints and autopilot progression without changing the
  core architecture.
- Support durable `status`, `inspect`, `resume`, `continue`, `approve`, and
  `cancel`.
- Rebuild worker context from artifacts and state, not from transcript
  continuity.
- Preserve enough durable contracts to derive detailed schemas later.

## Non-Goals For V1

- Parallel owning workers, parallel stages, or agent teams inside one run.
- A skill-owned runtime whose true state lives inside one interactive session.
- Transcript-driven routing or cross-stage continuity.
- Reusing the Python Praxis CLI as the control plane.
- Final field-level JSON schema design in this spec.

## System Shape

Praxis is a layered runtime. Control flows downward to execute work. Durable
results flow upward to decide what happens next.

```text
user / CI / thin wrapper
        |
        v
    Command plane
        |
        v
    Workflow plane
        |
        v
   Run control plane
        |
        v
     Adapter plane
        |
        v
      Worker plane
        |
        v
       Tool plane
        |
        v
 repo / shell / git / network

Every plane reads from and writes to:
- State plane: orchestration truth
- Artifact plane: work-product truth
```

The central rule is simple: provider sessions do stage work; Praxis decides
what that work means.

## Public CLI Surface

The public product surface should center on these command families:

- `praxis run`: create a run, select workflow and adapter, and initialize the
  first routing decision.
- `praxis continue`: advance a paused run when the next action is already
  derivable from durable state.
- `praxis resume`: continue an in-progress worker only when same-stage resume
  is still valid and safe.
- `praxis approve`: resolve an explicit human gate.
- `praxis cancel`: stop the active worker and mark the run cancelled or
  cancelling.
- `praxis status`: show the current run state and next valid action.
- `praxis inspect`: show deeper run, stage, session, and artifact details.
- `praxis doctor`: report adapter health, runtime integrity, and recoverability.

The runtime should also expose internal or advanced control-plane commands for
automation and debugging:

- `praxis dispatch`
- `praxis submit-stage-result`
- `praxis build-worker-launch`

These internal commands are part of the architecture, but they do not replace
the public operator surface.

## Plane 1: Command Plane

### Responsible for

- Exposing the CLI product surface.
- Parsing and validating operator intent.
- Mapping commands onto runtime services.
- Rendering human-readable and machine-readable output.
- Returning stable exit codes for automation.

Commander.js belongs here. This plane should contain no provider-specific
workflow logic and no durable state logic beyond invoking lower services.

### Inputs

- CLI arguments and flags.
- Current repo root and environment.
- Requested workflow, adapter, and execution mode.
- Operator intent such as run, inspect, approve, resume, or cancel.
- Existing Praxis runtime state when the command targets an existing run.

### Outputs

- Structured command results.
- Human-readable summaries and guidance.
- JSON envelopes for automation.
- Exit codes that distinguish success, blocked state, invalid input, failed
  health, and rejected progression.

### Side Effects

- Starts a new run or mutates an existing run through lower planes.
- Records operator actions such as approval or cancellation.
- Reads durable state for `status`, `inspect`, and `doctor`.

### Upstream And Downstream

- Upstream: user, CI, thin repo-local wrappers, provider-native convenience
  surfaces.
- Downstream: workflow plane and run control plane.

## Plane 2: Workflow Plane

### Responsible for

- Defining workflow graphs such as `craft`.
- Defining stage order, stage purpose, and completion semantics.
- Defining manual versus autopilot behavior.
- Defining story or slice boundaries and boundary stop conditions.
- Defining the expected artifact contracts for each stage.

This plane is deterministic and code-owned. It decides the allowed path; a
model never decides the workflow graph.

### Inputs

- Requested workflow and execution mode.
- Current run cursor.
- Accepted stage results.
- Human approvals when required by the workflow.
- Boundary handoff artifacts when a prior story or slice has completed.

### Outputs

- The active stage to run next.
- The next allowed action: dispatch, wait, approve, rework, finish, or fail.
- The expected input artifact set for the active stage.
- The expected output artifact set for the active stage.
- The worker shape required by the stage, such as a fresh session or same-stage
  resume in the target worktree.

### Side Effects

- Updates logical workflow position through the state plane.
- Creates checkpoints at stage or story boundaries.
- Declares when a result is sufficient to advance the run.

### Upstream And Downstream

- Upstream: command plane and accepted results from prior stages.
- Downstream: run control plane.

### Core Rule

Cross-stage continuity comes from accepted artifacts and the active boundary
handoff, not from session memory.

## Plane 3: Run Control Plane

### Responsible for

- Supervising the lifecycle of a run.
- Initializing run state from the chosen workflow.
- Compiling the dispatch bundle for the next owning worker.
- Tracking the active worker, active session, and resumability state.
- Validating stage-result provenance and completeness.
- Deciding whether the next action is launch, resume, wait, retry, rework,
  approval, or finish.
- Reconstructing the correct next action from durable state after interruption.

This is the true runtime supervisor.

### Inputs

- Workflow decisions from the workflow plane.
- Current durable runtime state.
- Operator actions from the command plane.
- Prior dispatch, session, and lifecycle evidence.
- Adapter capability signals such as resume support or health failures.

### Outputs

- Dispatch bundles for worker execution.
- Approval requests and checkpoint decisions.
- Accepted or rejected stage-result submissions.
- Recovery decisions and status projections.
- Next-action decisions for the command plane.

### Side Effects

- Persists run cursor updates, dispatch records, lifecycle events, approvals,
  checkpoints, recovery markers, and resumability evidence.
- Starts or resumes work by calling the adapter plane.
- Enforces fail-closed provenance checks before a run can advance.

### Upstream And Downstream

- Upstream: command plane, workflow plane, and state plane.
- Downstream: adapter plane, state plane, and artifact plane.

### Internal Modules

The run control plane should be decomposed into a small set of modules:

- workflow router
- checkpoint and approval manager
- dispatch compiler
- stage-result validator
- recovery engine
- status and inspection projector

## Plane 4: Adapter Plane

### Responsible for

- Translating a provider-neutral dispatch bundle into a Codex or Claude
  execution request.
- Launching a fresh worker session.
- Attempting same-stage resume when supported and safe.
- Recording provider-issued locators and lifecycle evidence.
- Normalizing health, resume, and cancellation behavior behind one contract.

This plane is provider-specific in implementation and provider-neutral in the
interface it exposes upward.

### Inputs

- Dispatch bundle from the run control plane.
- Repo-scoped adapter configuration.
- Repo-native instruction surfaces such as `AGENTS.md`,
  `.codex-plugin/config.toml`, `.codex-plugin/agents/`,
  `CLAUDE.md`, and `.claude-plugin/`.
- Codex or Claude SDK capability and health information.

### Outputs

- A launched or resumed worker session.
- A provider locator when the backend issues one.
- Normalized launch, resume, cancel, and health records.
- Structured adapter errors when execution cannot proceed.

### Side Effects

- Starts background processes or SDK-managed sessions.
- Starts fresh Praxis-owned provider sessions at stage boundaries and resumes
  only the session already registered for the active dispatch.
- Creates provider-specific runtime homes or isolated profiles when needed.
- Writes session, launch, resume, and cancellation evidence to durable state.

### Upstream And Downstream

- Upstream: run control plane.
- Downstream: worker plane and state plane.

### Adapter Rule

Adapters stay thin. They know how to run bounded workers; they do not own
workflow routing, recovery semantics, or artifact meaning.

## Plane 5: Worker Plane

### Responsible for

- Executing exactly one bounded stage assignment.
- Loading only the dispatch-approved context.
- Producing the declared outputs for the current stage.
- Stopping when the assignment is complete, blocked, cancelled, or escalated.

The worker is a stage executor, not the workflow owner.

### Inputs

- Run identity and dispatch identity.
- Stage identity, stage goal, and stage instructions.
- Allowed input artifacts and context manifest.
- Active boundary handoff, when one exists.
- Tool and policy manifest.
- Writable roots, isolation settings, and resume instructions.

### Outputs

- One machine-readable stage-result artifact for routing.
- Zero or more human-readable stage deliverables.
- Repo or worktree changes made by the stage.
- Logs, traces, and execution evidence.

### Side Effects

- Reads declared inputs only.
- Writes within allowed workspace boundaries only.
- Runs tools under the tool-plane policy contract.
- Edits the target repo's current worktree for every normal workflow stage.

### Upstream And Downstream

- Upstream: adapter plane.
- Downstream: tool plane during execution, then state plane and artifact plane,
  then back to run control through stage-result submission.

### Worker Modes

The architecture should support a small, explicit set of worker modes:

- fresh session worker
- same-stage resumable worker

Only one owning worker is active for a run in v1.

## Plane 6: Tool Plane

### Responsible for

- Providing controlled access to filesystem, shell, git, search, patching, and
  network.
- Enforcing runtime permissions and writable boundaries.
- Recording tool-use and policy evidence.

This plane is the boundary between a worker and the host environment.

### Inputs

- Worker tool requests.
- Tool manifest from the dispatch bundle.
- Runtime policy, budgets, writable roots, and blocked paths.

### Outputs

- Native tool results.
- Denials and failures with reason codes.
- Tool-use telemetry for inspection and recovery.

### Side Effects

- Executes approved host operations.
- Records granted, denied, and failed tool usage.
- Produces policy evidence whenever runtime rules affect execution.

### Upstream And Downstream

- Upstream: worker plane and run control policy.
- Downstream: repo, filesystem, shell, git, network, and state plane.

## Plane 7: State Plane

### Responsible for

- Persisting orchestration truth under `.praxis/`.
- Making `status`, `inspect`, `resume`, `continue`, and recovery possible
  without transcript continuity.
- Separating long-lived control state from stage work products.

The state plane stores how Praxis is operating, why it made a decision, and
what the next valid action is.

### Inputs

- Command outcomes.
- Workflow checkpoints.
- Dispatch bundles and worker plans.
- Session, launch, resume, cancel, and health evidence.
- Approval decisions.
- Tool-use telemetry and policy records.
- Accepted or rejected stage-result submissions.

### Outputs

- Reconstructable run status.
- Active worker and active session linkage.
- Recovery context for relaunch, resume, cleanup, or operator guidance.
- Durable projections for `status`, `inspect`, and `doctor`.

### Side Effects

- Writes and updates repo-scoped runtime state under `.praxis/`.
- Preserves operator-visible history.
- May record cleanup ownership for temp directories or legacy runtime surfaces
  when needed.

### Upstream And Downstream

- Upstream: command, workflow, run control, adapter, worker, and tool planes.
- Downstream: command plane, workflow plane, run control plane, and artifact
  resolution.

### What The State Plane Must Distinguish

- Orchestration truth: what Praxis did, why, and what is allowed next.
- Work-product truth: what the task produced for later stages.

That distinction is what keeps routing durable and inspection understandable.

## Plane 8: Artifact Plane

### Responsible for

- Carrying work products across stages through explicit contracts.
- Preserving the primary outputs of each stage.
- Preserving boundary handoffs as the only supported cross-story carry-forward
  input.
- Supplying later stages with bounded, reviewable inputs.

The artifact plane stores the substance of the task, not the supervision of the
task.

### Inputs

- Expected artifact contracts from the workflow plane.
- Accepted dispatch and stage context from the run control plane.
- Generated outputs from the worker plane.

### Outputs

- Machine-readable stage results.
- Human-readable stage deliverables.
- Boundary handoffs between stories or slices.
- Final completion records and other stage-local outputs needed downstream.

### Side Effects

- Creates durable stage folders and artifact files.
- Preserves both machine-readable and human-readable forms when both are needed.
- Provides the explicit input set for later stages.

### Upstream And Downstream

- Upstream: workflow plane, run control plane, and worker plane.
- Downstream: workflow plane, the next worker dispatch, and operator inspection
  surfaces.

### Artifact Rule

The stage-result artifact is the routing API. Logs and transcripts may explain
what happened, but they do not advance the workflow on their own.

## Recommended TypeScript Module Decomposition

The new CLI should stay close to the plane boundaries:

- `src/cli/`: Commander.js command registry, argument parsing, output
  formatting, exit codes.
- `src/workflows/`: workflow graphs, stage definitions, routing rules,
  autopilot and manual semantics.
- `src/runtime/control/`: run supervisor, checkpoint manager, dispatch
  compiler, validators, recovery, status projection.
- `src/adapters/`: Codex adapter and Claude adapter built on their TypeScript
  agent SDKs.
- `src/runtime/workers/`: worker launch envelopes, worker modes, worker-host
  helpers, and stage contracts.
- `src/runtime/tools/`: tool broker, policy enforcement, telemetry hooks.
- `src/runtime/state/`: durable store, event log, projections, recoverability
  helpers.
- `src/runtime/artifacts/`: artifact writers, readers, resolvers, handoff
  helpers.
- `src/contracts/`: shared contracts and validators used across all planes.

This separation matters more than exact folder names. The key is to keep
workflow semantics, runtime supervision, provider adapters, state, and artifacts
cleanly separated.

## What Praxis Must Store

Praxis needs two storage scopes: stable repo-level Praxis assets and per-run
durable runtime memory.

### 1. Repo-Level Praxis Assets

These are stable inputs to the system and should usually live in version
control:

- workflow definitions
- contract definitions and validators
- adapter harness configuration
- repo-native instruction surfaces, including the authoritative
  `.codex-plugin/` and `.claude-plugin/` surfaces
- operator documentation and debugging helpers
- runtime version or migration markers when needed

These assets explain how Praxis works in a repository. They are not the record
of a specific task run.

### 2. Per-Run Praxis State

Each run should store enough information to answer all of these questions:

- What workflow, adapter, and execution mode is this run using?
- What stage is active, completed, blocked, or next?
- What worker currently owns the run?
- Is there an active resumable session?
- What is the next valid operator action?
- Did the run pause for approval, failure, cancellation, or boundary logic?
- Can the run safely continue from durable state alone?

Without fixing final JSON fields, the architecture requires these state
families:

- run manifest or run cursor
- stage history and current routing position
- story or slice ledger when the workflow spans multiple units
- active dispatch bundle and context manifest
- worker, session, launch, resume, and cancel records
- approval and checkpoint records
- policy and tool-use records
- lifecycle events, traces, logs, and health records
- recovery markers and terminal outcome records

### 3. Per-Run Task Artifacts

Each run also needs durable work-product artifacts that later stages can
consume without reading the full transcript.

At minimum, the system needs these artifact families:

- machine-readable stage results
- one primary human-readable artifact when the stage has a user-facing output
- optional supporting artifacts such as spec notes, design sketches, review
  reports, improvement notes, or verification summaries
- boundary handoff artifacts for story or slice transitions
- final completion artifact for the run outcome

The exact filenames can vary. What matters is that every downstream consumer
knows which artifact is authoritative.

## Required Contracts

This spec does not define final schema fields, but it does define the contracts
the system must preserve.

### Contract Families

- workflow contract: what stages exist, in what order, with what stop
  conditions
- run contract: how current run position and status are represented
- dispatch contract: what one worker was asked to do, see, and write
- session contract: how Praxis tracks provider-native continuation safely
- policy contract: what tools, permissions, and writable scopes were allowed
- stage-result contract: how a stage declares completion, blockers, or rework
- handoff contract: how one story or slice passes bounded context to the next
- observability contract: how traces, logs, health, and lifecycle evidence are
  recorded and inspected

### Contract Requirements

Every contract should be:

- durable
- small enough to rebuild worker context without transcript dependence
- provider-agnostic above the adapter layer
- sufficient for recovery and audit
- versionable without breaking the runtime model

## End-To-End Lifecycle

1. `praxis run` creates a run and writes the initial state.
2. The workflow plane selects the first active stage.
3. The run control plane compiles the dispatch bundle and persists it.
4. The adapter plane launches a fresh worker or performs a safe same-stage
   resume.
5. The worker executes the stage through the tool plane and writes its outputs.
6. `praxis submit-stage-result` validates provenance and accepts or rejects the
   result.
7. The workflow plane routes to the next stage, waits for approval, writes a
   boundary handoff, or finishes the run.
8. `praxis status`, `inspect`, `resume`, `continue`, and `doctor` reconstruct
   the next action from durable state and artifacts.

## Core Invariants

- The new TypeScript `praxis` CLI is the product entrypoint.
- Commander.js is only the shell of the command surface; workflow truth lives
  below it.
- Codex and Claude are backend workers, not workflow owners.
- The new runtime does not depend on the Python CLI for orchestration.
- Only one owning worker is active at a time in v1.
- Fresh context is the default at stage boundaries.
- Same-stage resume is an optimization, not a dependency.
- Cross-story carry-forward happens only through the explicit handoff contract.
- The state plane stores orchestration truth.
- The artifact plane stores work-product truth.
- If provenance is incomplete or contracts do not validate, Praxis fails closed
  instead of guessing.

## Result

Praxis should be implemented as a CLI-owned, SDK-backed, artifact-driven
runtime:

- the command plane is the operator surface
- the workflow plane defines the allowed path
- the run control plane supervises execution and recovery
- the adapter plane integrates Codex and Claude through TypeScript SDKs
- the worker plane performs one bounded stage assignment
- the tool plane governs host access
- the state plane preserves orchestration truth
- the artifact plane carries the task across the workflow

That separation gives the new Praxis CLI the right properties for v1:
durability, isolation, recoverability, provider interchangeability, and a clean
base for future expansion.
