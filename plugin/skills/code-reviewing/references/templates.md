# Code Review Report Template

Use this template for medium+ reviews. For small reviews, use a condensed version — premise check, layers 1–3 (brief), and issues table only.

```markdown
## Code Review: [story/slice title]

**Scope**: [N files reviewed] | [brief description of what was built]

### Premise Check

- **Real problem?** [Yes — brief justification / No — this is solving an imagined problem (Critical)]
- **Simpler way?** [No — this is a reasonable approach / Yes — describe the simpler alternative]
- **Breaking risk?** [None identified / Yes — describe what's at risk]

### Layer 1: Data Structures

[Analysis of data modeling, ownership, flow, unnecessary copying. If clean, say so briefly.]

### Layer 2: Special Cases

[Inventory of significant conditionals. Which are essential business logic, which are design patches. For each design patch, how would restructuring data eliminate it?]

### Layer 3: Complexity

[Feature essence in one sentence. Indentation depth observations. Function focus assessment. Abstraction audit.]

### Layer 4: Breaking Changes

[API contract analysis, behavior changes, dependency impacts. Or "No breaking changes identified."]

### Layer 5: Practicality

[Problem reality check. Complexity-to-impact ratio. Silent fallback detection. Error handling at boundaries.]

### Issues

#### Critical

_None found._ (or table below)

| # | File:Line | Layer | Issue | Recommendation |
|---|-----------|-------|-------|----------------|
| 1 | `path/to/file.ts:42` | L1 Data | [what's wrong and why it matters] | [specific fix: "Replace X with Y"] |

#### High

_None found._ (or table below)

| # | File:Line | Layer | Issue | Recommendation |
|---|-----------|-------|-------|----------------|

#### Medium

_None found._ (or table below)

| # | File:Line | Layer | Issue | Recommendation |
|---|-----------|-------|-------|----------------|

#### Low (for user consideration)

_None found._ (or table below)

| # | File:Line | Layer | Issue | Recommendation |
|---|-----------|-------|-------|----------------|

### What's Done Well

- [Acknowledge specific good decisions — data structure choice, clean separation, idiomatic usage, etc.]

### Summary

- Critical: N | High: N | Medium: N | Low: N
- Auto-fixable (critical + high + medium): N
- For user review (low): N
```

## Guidelines

- **Layer column**: Tag each issue with the layer that surfaced it (L1–L5) so the fixer understands the analytical context.
- **File:Line format**: Always include the file path and line number so the fixer can locate issues precisely.
- **Actionable recommendations**: Every issue needs a concrete recommendation. "Eliminate this branch by restructuring X to include Y" not "consider simplifying."
- **Group related issues**: If the same pattern appears in multiple files, list it once with all locations rather than repeating the same finding.
- **Empty sections are fine**: If there are no critical issues, say so. Don't manufacture findings.
- **Layer analysis can be brief**: If a layer has no findings, one sentence is enough. "Data structures are well-modeled — clear ownership, no unnecessary copying."
- **Premise check is a filter**: If the premise check reveals an imagined problem, the rest of the review should still analyze the code — but framed by that critical finding.
