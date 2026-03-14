# Praxis

Spec-driven, test-driven development plugin.

Theory without practice is empty. Practice without theory is blind. **Praxis** is the cycle where understanding and action inform each other — you spec what to build, build it through TDD, verify against the spec, and adapt when reality diverges.

## The workflow

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

### Prototype workflow (`/prototype`)

```text
clarifying-intent ──→ [slicing-stories] ──→ sketching-design ──→ rapid-implementing ──→ done
       ↑                                                                |
       └──────────────── feedback (spec issues) ───────────────────────┘
```

Same spec-driven clarification, then auto-advance without human checkpoints or test writing. Fast path for prototypes and MVPs.

## Skills

| Skill                    | What it does                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `clarifying-intent`      | Turns a vague idea into a testable behavioral spec with Given/When/Then acceptance criteria                           |
| `slicing-stories`        | Splits a large feature into thin, vertical story slices ordered by build sequence                                     |
| `sketching-design`       | Locates affected files, matches existing patterns, proposes a direction — just enough to write the first failing test |
| `driving-tdd`            | Red → Green → Refactor, one acceptance criterion at a time                                                            |
| `verifying-and-adapting` | Checks the whole story against the spec, reconciles divergences, routes to next slice or done                         |
| `rapid-implementing`     | Implements acceptance criteria as working code without writing tests — for prototype/MVP mode                         |
| `linus-style-reviewing`  | Blunt design and code review focused on simplicity, fewer special cases, and backwards compatibility                  |

## Fast paths

Not everything needs the full ceremony.

- **Trivial** (typo, rename, config tweak): state the change, implement, done.
- **Bug fix**: `clarifying-intent` → `driving-tdd`. Skip design and verification.
- **Refactor**: existing tests cover the behavior. Refactor, re-run, done.
- **Small story** (1-2 days): `clarifying-intent` → `sketching-design` (optional) → `driving-tdd` → `verifying-and-adapting`.
- **Prototype/MVP**: `clarifying-intent` → auto-advance through `sketching-design` → `rapid-implementing`. No tests, no human checkpoints after spec confirmation.

Every skill triages by size and skips ceremony that doesn't earn its keep.

## Principles

**Spec-driven, not doc-driven.** The spec is a living checklist of testable behaviors, not a frozen document. Update it when reality diverges.

**Design emerges from TDD.** The design sketch is a compass, not a blueprint. The real architecture reveals itself during Red → Green → Refactor.

**Thin vertical slices.** Each slice delivers one end-to-end behavior. The first slice is always a walking skeleton that proves the integration.

**Last responsible moment.** Defer decisions until you have the information to make them well. Carry unknowns forward as notes, not premature commitments.

**Proportional ceremony.** A one-line fix doesn't need a spec. A multi-slice feature does. Every skill triages first and scales accordingly.

## Plugin structure

```
praxis/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── skills/                  # Skill definitions
│   ├── clarifying-intent/
│   ├── slicing-stories/
│   ├── sketching-design/
│   ├── driving-tdd/
│   ├── verifying-and-adapting/
│   ├── rapid-implementing/
│   └── linus-style-reviewing/
├── commands/                # Slash commands
│   ├── praxis.md            # Full workflow orchestrator
│   └── prototype.md         # Prototype/MVP orchestrator
├── CLAUDE.md
└── README.md
```

## License

MIT
