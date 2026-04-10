# Praxis

Spec-driven, test-driven development plugin for Claude Code and Codex.

Theory without practice is empty. Practice without theory is blind. **Praxis** is the cycle where understanding and action inform each other — you spec what to build, build it through TDD, verify against the spec, and adapt when reality diverges.

## How it works

Start from the highest level of abstraction — a vague idea, a problem statement, a feature request — and transform it step by step into concrete, working code. Each stage has one job. Do that job and move on.

### Craft workflow (`/craft` in Claude, `craft` skill in Codex)

```text
     clarifying-intent
      ↙            ↘
[small/medium]    [large]
     ↓               ↓
     |          slicing-stories ──→ pick a slice ──→ clarifying-intent
     ↓                                                      ↓
sketching-design  ←──────────────────────────────────────────┘
     ↓
 driving-tdd
     ↓
verifying-and-adapting ──→ next slice / done / rework
```

Every transition is a human decision, not an automated pipeline. You drive the workflow; the skills provide structure at each step.

### Forge workflow (`/forge` in Claude, `forge` skill in Codex)

```text
clarifying-intent ──→ [slicing-stories] ──→ sketching-design ──→ rapid-implementing ──→ done
       ↑                                                                |
       └──────────────── feedback (spec issues) ───────────────────────┘
```

Same spec-driven clarification, then auto-advance without human checkpoints or test writing. Production-grade code, just without writing new tests.

## Skills

| Skill                    | What it does                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `clarifying-intent`      | Turns a vague idea into a testable behavioral spec with Given/When/Then acceptance criteria                           |
| `slicing-stories`        | Splits a large feature into thin, vertical story slices ordered by build sequence                                     |
| `sketching-design`       | Locates affected files, matches existing patterns, proposes a direction — just enough to write the first failing test |
| `driving-tdd`            | Red → Green → Refactor, one acceptance criterion at a time                                                            |
| `verifying-and-adapting` | Checks the whole story against the spec, reconciles divergences, routes to next slice or done                         |
| `rapid-implementing`     | Implements acceptance criteria as production-grade code without writing new tests                                     |

## Fast paths

Not everything needs the full ceremony.

- **Trivial** (typo, rename, config tweak): state the change, implement, done.
- **Bug fix**: `clarifying-intent` → `driving-tdd`. Skip design and verification.
- **Refactor**: existing tests cover the behavior. Refactor, re-run, done.
- **Small story** (1-2 days): `clarifying-intent` → `sketching-design` (optional) → `driving-tdd` → `verifying-and-adapting`.
- **Fast delivery** (`/forge`): `clarifying-intent` → auto-advance through `sketching-design` → `rapid-implementing`. No new tests, no human checkpoints after spec confirmation.

Every skill triages by size and skips ceremony that doesn't earn its keep.

## Principles

**Progressive refinement.** Start from the highest abstraction — a vague idea, a user problem — and transform it step by step into spec, design, tests, and code. Each stage has one job. Do that job and move on.

**Core behavior, not exhaustive coverage.** Focus acceptance criteria and tests on the behaviors users will perceive. Each AC should represent a change a real user can see or experience. A few precise criteria beat many overlapping ones.

**High standards, fewer tests.** Each acceptance criterion and test should be precise and meaningful. Avoid redundant tests that verify the same behavior from different angles. Quality over quantity in both implementation and testing.

**Sharp, fast, minimal.** Deliver a version that allows users to use the core functionality, does not break existing behavior, and maintains sufficient code quality. Do not wait for a perfect result before shipping.

**Spec-driven, not doc-driven.** The spec is a living checklist of testable behaviors, not a frozen document. Update it when reality diverges.

**Design emerges from TDD.** The design sketch is a compass, not a blueprint. The real architecture reveals itself during Red → Green → Refactor.

**Thin vertical slices.** Each slice delivers one end-to-end behavior a user can perceive. The first slice is always a walking skeleton that proves the integration.

**Do not break what works.** Run existing tests after every change. Existing behavior is a contract — honor it unless explicitly told otherwise.

**Sufficiently maintainable code.** Simple, effective, pragmatic, easy to understand, extensible, easy to change. Not theoretically optimal — practically good.

**Last responsible moment.** Defer decisions until you have the information to make them well. Carry unknowns forward as notes, not premature commitments.

**Proportional ceremony.** A one-line fix doesn't need a spec. A multi-slice feature does. Every skill triages first and scales accordingly.

## Plugin structure

```
praxis/
├── workflow/
│   ├── pipelines/
│   │   ├── craft.md         # Shared craft orchestration source of truth
│   │   └── forge.md         # Shared forge orchestration source of truth
│   └── contracts/
│       ├── run.schema.json  # .praxis/run.json contract
│       └── stage-result.schema.json # Stage result contract
├── .codex-plugin/
│   └── plugin.json          # Codex plugin manifest
├── .claude-plugin/
│   └── plugin.json          # Claude plugin manifest
├── skills/                  # Skill definitions
│   ├── craft/               # Codex workflow entrypoint (full workflow)
│   ├── forge/               # Codex workflow entrypoint (fast workflow)
│   ├── clarifying-intent/
│   ├── slicing-stories/
│   ├── sketching-design/
│   ├── driving-tdd/
│   ├── verifying-and-adapting/
│   └── rapid-implementing/
├── commands/                # Claude slash commands
│   ├── craft.md             # Thin Claude wrapper over workflow/pipelines/craft.md
│   └── forge.md             # Thin Claude wrapper over workflow/pipelines/forge.md
├── CLAUDE.md
└── README.md
```

## Workflow architecture

Praxis v2 splits the workflow into three layers:

- `workflow/pipelines/` defines the shared `craft` and `forge` orchestration rules: stage order, checkpoint policy, routing semantics, and completion rules.
- `workflow/contracts/` defines the machine-readable contracts for workflow state and stage results.
- `commands/` and `skills/craft` / `skills/forge` are now thin runtime adapters. Claude and Codex each keep their own entrypoints, but both point at the same shared workflow source of truth.

This keeps the workflow semantics portable while still allowing Claude- and Codex-specific wrappers where needed.

## `.praxis/` contract

Praxis still uses human-readable artifacts in `.praxis/`, but v2 adds structured state so the orchestrator does not need to infer routing from markdown alone.

Core workflow files:

- `.praxis/run.json` is the workflow cursor for the active run.
- `.praxis/results/<stage>.json` is the routing result written by each stage.
- Human-readable artifacts such as `.praxis/spec.md`, `.praxis/sketch.md`, `.praxis/tdd.md`, and `.praxis/verification.md` remain the reading surface for the user.

Feature-level artifacts always live at `.praxis/` root:

- `.praxis/brief.md`
- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/run.json`
- `.praxis/results/slicing-stories.json`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write slice-local artifacts under `.praxis/slices/{slice-id}/`, including stage results:

- `.praxis/slices/{slice-id}/spec.md`
- `.praxis/slices/{slice-id}/sketch.md`
- `.praxis/slices/{slice-id}/tdd.md`
- `.praxis/slices/{slice-id}/results/driving-tdd.json`

The human-readable artifact is for people. The result JSON is for orchestration.

## Codex support

- `.codex-plugin/plugin.json` exposes Praxis as a Codex plugin using the existing `skills/` directory.
- `skills/craft/SKILL.md` and `skills/forge/SKILL.md` now act as thin Codex-native wrappers over `workflow/pipelines/craft.md` and `workflow/pipelines/forge.md`.
- The stage skills now use repo-relative `references/` and `scripts/` paths instead of the Claude-only `CLAUDE_SKILL_DIR` variable, so the same skill content can be reused in Codex.
- `commands/` remains useful for Claude as thin wrappers over the same shared pipeline files, while Codex consumes the mirrored workflow entrypoints under `skills/`.

## License

MIT
