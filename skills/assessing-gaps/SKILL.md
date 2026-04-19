---
name: assessing-gaps
description: Assess implementation gaps between an authoritative target spec and the repo, producing a durable Gap Assessment. Called by the converge-pre-remediation workflow after clarifying-intent produces the target spec. Use when the user asks to "assess gaps", "check what's missing", "compare implementation against spec", or when a target spec is ready and the next step is gap analysis.
context: fork
allowed-tools: Read, Grep, Glob, Bash
---

# Assessing Gaps

## Overview

Compare the active target spec (`.praxis/target-spec.md`) against the repository and emit a durable Gap Assessment enumerating every material discrepancy. The downstream planning-remediation stage reads your output to bound the next remediation pass.

The caller provides the dispatch contract. Your job: read the spec + repo, write `.praxis/gap.md` and `.praxis/gap.json` plus `.praxis/results/assessing-gaps.json`, and exit.

## Workflow

1. **Read the authoritative inputs.**
   - Target spec: `.praxis/target-spec.md` (contains Goal, Scope, Non-Goals, Constraints, Acceptance Criteria).
   - Objective source: `.praxis/objective.md` (the user intent and any derived context).
   - Clarification record: `.praxis/clarification.json` (approval status, sourced decisions).

2. **Bound your scan.**
   - Use the spec's Scope list to restrict file walks.
   - Skip vendored or generated directories (`.git`, `.praxis`, `node_modules`, `dist`, `build`, `coverage`).

3. **For each Acceptance Criterion, assess the gap.**
   - Locate the code surfaces that would satisfy it.
   - Classify the finding as `missing`, `partial`, or `wrong`.
   - Choose severity: `critical` (blocks correctness/security/safety), `high` (breaks documented behavior), `medium` (noticeable but workaround exists), `low` (polish, future concern).
   - Choose a confidence in [0,1]: how sure are you that the finding is real?
   - Collect evidence: file paths + line numbers + snippets that motivate the finding.
   - Name affected paths you'd change to fix it.
   - Propose a recommended direction (1-2 sentences).

4. **Write the outputs.**

   `.praxis/gap.md` (human-readable, ordered by severity):
   ```
   # Gap Assessment

   ## Assessment Scope
   - Target spec: .praxis/target-spec.md
   - Profile: <profile>
   - Scope: <space-separated paths, or (repo root)>
   - Findings: <count>

   ## Ordered Findings
   ### G-001 <Short Title>
   - Kind: missing | partial | wrong
   - Severity: critical | high | medium | low
   - Confidence: 0.0-1.0
   - Category: <short category tag>
   - Expected behavior: <from the spec>
   - Current behavior: <what the repo does now>
   - Evidence: <path:line snippet | ...>
   - Affected paths: <paths>
   - Recommended direction: <1-2 sentences>
   ```

   `.praxis/gap.json` (machine-readable; schema matches `GapAssessmentResult`):
   ```json
   {
     "version": 1,
     "profile": "product-spec-gap",
     "review_id": "<R-###>",
     "target_spec_path": ".praxis/target-spec.md",
     "findings": [
       {
         "finding_id": "G-001",
         "fingerprint": "",
         "title": "...",
         "kind": "missing",
         "severity": "high",
         "category": "cli-surface",
         "summary": "...",
         "expected_behavior": "...",
         "current_behavior": "...",
         "evidence": ["..."],
         "objective_refs": ["R-001:acceptance-criteria"],
         "affected_paths": ["src/..."],
         "recommended_direction": "...",
         "recommended_action": "...",
         "confidence": 0.7
       }
     ],
     "generated_at": "<ISO8601 UTC>"
   }
   ```
   Leave `fingerprint` as `""` — the host computes it deterministically.

   `.praxis/results/assessing-gaps.json` (converge stage result):
   ```json
   {
     "version": 1,
     "stage": "assessing-gaps",
     "status": "completed",
     "profile": "product-spec-gap",
     "review_id": "<R-###>",
     "route": { "kind": "proceed" },
     "data": {
       "outcome_code": "findings_recorded",
       "next_stage": "planning-remediation",
       "routing_reason": "Gap findings are recorded and ready for planning.",
       "findings_count": <n>
     }
   }
   ```
   If no gaps found: set `outcome_code: "no_gaps"`, `route.kind: "done"`, omit `next_stage` or set to `null`.

5. **Stop and exit.** Do not ask clarifying questions. If the spec is too ambiguous to assess, emit a finding describing the ambiguity (kind: `partial`, severity: `high`) rather than pausing.

## Guardrails

- Do NOT modify implementation code.
- Do NOT widen scope beyond the target spec's declared Scope section.
- Produce at least one finding per unsatisfied Acceptance Criterion.
- Keep findings evidence-backed — every finding needs at least one concrete path/line reference.
- Evidence snippets should be ≤160 chars each; trim and ellipsize.

## Triggers

Run when the host dispatches `/praxis:assessing-gaps`, when the user asks to "assess the gap against the spec", or when the converge-pre-remediation workflow routes to assessing-gaps after clarifying-intent produces a ready target spec.
