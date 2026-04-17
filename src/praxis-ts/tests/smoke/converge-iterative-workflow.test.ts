import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  runConvergeContinueCommand,
  runConvergeRunCommand,
  runContinueCommand,
  runDispatchCommand,
  runSubmitStageResultCommand,
} from "../../src/cli/commands/index.js";
import { EXIT_CODE } from "../../src/cli/exit-codes.js";
import type {
  CampaignRecord,
  RunRecord,
  StageName,
  StageResultRecord,
} from "../../src/contracts/model.js";
import { validateConvergeStageResult } from "../../src/contracts/validators.js";
import {
  WORKFLOW_GRAPH,
  getConvergeWorkflowStageContract,
  resolveConvergeWorkflowTransition,
  resolveWorkflowOutcome,
} from "../../src/workflows/index.js";
import { planRemediation } from "../../src/runtime/converge/planner.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REQUIRED_CONVERGE_HANDOFF_ARTIFACTS = [
  ".praxis/target-spec.md",
  ".praxis/clarification.json",
  ".praxis/gap.md",
  ".praxis/gap.json",
  ".praxis/remediation-map.md",
  ".praxis/remediation-map.json",
];

interface ConvergeObjectiveOptions {
  lines: string[];
}

async function writeObjective(
  repoRoot: string,
  options: ConvergeObjectiveOptions,
): Promise<string> {
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  const objectivePath = join(repoRoot, "docs", "objective.md");
  await writeFile(objectivePath, ["# Objective", "", ...options.lines].join("\n"), "utf8");
  return "docs/objective.md";
}

async function writePlanningDoc(repoRoot: string, lines: string[]): Promise<void> {
  await mkdir(join(repoRoot, ".plan"), { recursive: true });
  await writeFile(
    join(repoRoot, ".plan", "shadow-evidence.md"),
    ["# Planning Notes", "", ...lines].join("\n"),
    "utf8",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareDispatch(repoRoot: string): Promise<string> {
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  if (run.active.dispatch_id) {
    return run.active.dispatch_id;
  }
  assert.equal(await runDispatchCommand(repoRoot, true), EXIT_CODE.OK);
  const refreshed = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(refreshed.active.dispatch_id);
  return refreshed.active.dispatch_id;
}

async function submitStage(
  repoRoot: string,
  stage: StageName,
  artifactDir: string,
  outcomeCode: string,
  routeKind: StageResultRecord["route"]["kind"],
): Promise<void> {
  const dispatchId = await prepareDispatch(repoRoot);
  const activeRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  const overrides: Partial<StageResultRecord> = {
    dispatch_id: dispatchId,
  };
  if (activeRun.active.session_id) {
    overrides.session_id = activeRun.active.session_id;
  }
  const stageResultPath = await writeStageResult(
    repoRoot,
    stage,
    artifactDir,
    outcomeCode,
    routeKind,
    {
      ...overrides,
    },
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, stageResultPath), EXIT_CODE.OK);
}

async function initGitRepo(repoRoot: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "smoke@example.com"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Smoke Bot"], { cwd: repoRoot });
  await execFileAsync("git", ["add", "."], { cwd: repoRoot });
  await execFileAsync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "seed"], {
    cwd: repoRoot,
  });
}

void test("smoke: converge writes target-spec gap artifacts and launches bounded remediation", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must enforce bounded remediation scope per pass.",
      "- Must pass selected findings and non-goals into child craft execution.",
      "- Must persist converge campaign artifacts under .praxis.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 3,
      maxStoriesPerPass: 3,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.mode, "multi_slice");
  assert.ok(run.workflow_constraints?.bounded_scope);
  assert.ok(run.workflow_constraints.clarifying_required_artifacts?.length);

  const targetSpec = await readFile(join(repoRoot, ".praxis", "target-spec.md"), "utf8");
  assert.match(targetSpec, /^# Target Spec/m);
  assert.match(targetSpec, /^## Goal$/m);
  assert.match(targetSpec, /^## Scope$/m);
  assert.match(targetSpec, /^## Non-Goals$/m);
  assert.match(targetSpec, /^## Constraints$/m);
  assert.match(targetSpec, /^## Acceptance Criteria$/m);

  const clarifyingResult = await readJson<{ stage: string; data: { outcome_code: string } }>(
    join(repoRoot, ".praxis", "results", "clarifying-intent.json"),
  );
  assert.equal(clarifyingResult.stage, "clarifying-intent");
  assert.equal(clarifyingResult.data.outcome_code, "target_spec_ready");

  const gap = await readJson<{
    target_spec_path: string;
    findings: {
      finding_id: string;
      kind: string;
      expected_behavior: string;
      current_behavior: string;
      recommended_direction: string;
      confidence: number;
    }[];
  }>(join(repoRoot, ".praxis", "gap.json"));
  assert.equal(gap.target_spec_path, ".praxis/target-spec.md");
  assert.ok(gap.findings.length > 0);
  for (const finding of gap.findings) {
    assert.match(finding.finding_id, /^G-\d{3}$/);
    assert.match(finding.kind, /^(missing|partial|wrong)$/);
    assert.ok(finding.expected_behavior.length > 0);
    assert.ok(finding.current_behavior.length > 0);
    assert.ok(finding.recommended_direction.length > 0);
    assert.equal(typeof finding.confidence, "number");
  }

  const remediationMap = await readJson<{
    selected_finding_ids: string[];
    deferred_finding_ids: string[];
    slices: {
      slice_id: string;
      finding_ids: string[];
      scope: string[];
      done_condition: string;
    }[];
  }>(join(repoRoot, ".praxis", "remediation-map.json"));
  assert.ok(remediationMap.selected_finding_ids.length > 0);
  assert.ok(Array.isArray(remediationMap.deferred_finding_ids));
  assert.ok(remediationMap.slices.length > 0);
  for (const slice of remediationMap.slices) {
    assert.match(slice.slice_id, /^S-\d{3}$/);
    assert.ok(slice.finding_ids.length > 0);
    assert.ok(slice.scope.length > 0);
    assert.ok(slice.done_condition.length > 0);
  }

  const assessingResult = await readJson<{ stage: string; data: { outcome_code: string } }>(
    join(repoRoot, ".praxis", "results", "assessing-gaps.json"),
  );
  assert.equal(assessingResult.stage, "assessing-gaps");
  assert.match(assessingResult.data.outcome_code, /^(findings_recorded|no_gaps)$/);

  const planningResult = await readJson<{ stage: string; data: { outcome_code: string } }>(
    join(repoRoot, ".praxis", "results", "planning-remediation.json"),
  );
  assert.equal(planningResult.stage, "planning-remediation");
  assert.match(planningResult.data.outcome_code, /^(remediation_map_ready|no_selection)$/);

  const requiredArtifacts = run.workflow_constraints.clarifying_required_artifacts ?? [];
  const briefPath = requiredArtifacts[0];
  assert.ok(briefPath);
  for (const artifact of REQUIRED_CONVERGE_HANDOFF_ARTIFACTS) {
    assert.ok(requiredArtifacts.includes(artifact), `missing required artifact ${artifact}`);
  }
  const dispatchId = await prepareDispatch(repoRoot);
  const dispatch = await readJson<{ inputs: { required_artifacts: string[] } }>(
    join(repoRoot, ".praxis", "dispatches", `${dispatchId}.json`),
  );
  assert.ok(dispatch.inputs.required_artifacts.includes(briefPath));
  for (const artifact of REQUIRED_CONVERGE_HANDOFF_ARTIFACTS) {
    assert.ok(
      dispatch.inputs.required_artifacts.includes(artifact),
      `dispatch missing ${artifact}`,
    );
  }
});

void test("smoke: converge pre-remediation stage results expose routing metadata", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must keep pre-remediation stages explicit and contract-driven.",
      "- Must emit stable stage routing metadata for clarifying, assessing, and planning.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "architecture-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const clarifyingResult = await readJson<{
    stage: string;
    data: {
      outcome_code: string;
      next_stage: string | null;
      routing_reason: string;
    };
  }>(join(repoRoot, ".praxis", "results", "clarifying-intent.json"));
  assert.equal(clarifyingResult.stage, "clarifying-intent");
  assert.equal(clarifyingResult.data.outcome_code, "target_spec_ready");
  assert.equal(clarifyingResult.data.next_stage, "assessing-gaps");
  assert.match(clarifyingResult.data.routing_reason, /target specification/i);

  const assessingResult = await readJson<{
    stage: string;
    data: {
      outcome_code: string;
      next_stage: string | null;
      routing_reason: string;
    };
  }>(join(repoRoot, ".praxis", "results", "assessing-gaps.json"));
  assert.equal(assessingResult.stage, "assessing-gaps");
  assert.match(assessingResult.data.outcome_code, /^(findings_recorded|no_gaps)$/);
  if (assessingResult.data.outcome_code === "findings_recorded") {
    assert.equal(assessingResult.data.next_stage, "planning-remediation");
  } else {
    assert.equal(assessingResult.data.next_stage, null);
  }
  assert.match(assessingResult.data.routing_reason, /(findings|no unresolved findings)/i);

  const planningResult = await readJson<{
    stage: string;
    data: {
      outcome_code: string;
      next_stage: string | null;
      routing_reason: string;
    };
  }>(join(repoRoot, ".praxis", "results", "planning-remediation.json"));
  assert.equal(planningResult.stage, "planning-remediation");
  assert.match(planningResult.data.outcome_code, /^(remediation_map_ready|no_selection)$/);
  if (planningResult.data.outcome_code === "no_selection") {
    assert.equal(planningResult.data.next_stage, "planning-remediation");
  } else {
    assert.equal(planningResult.data.next_stage, null);
  }
  assert.match(planningResult.data.routing_reason, /(remediation map|selected)/i);
});

void test("smoke: shared workflow contracts define converge pre-remediation stages", () => {
  const clarifying = getConvergeWorkflowStageContract("clarifying-intent");
  assert.equal(clarifying.required_inputs[0], ".praxis/objective.md");
  assert.ok(clarifying.outputs.includes(".praxis/target-spec.md"));
  assert.ok(clarifying.outputs.includes(".praxis/clarification.json"));

  const assessingTransition = resolveConvergeWorkflowTransition(
    "assessing-gaps",
    "findings_recorded",
  );
  assert.equal(assessingTransition.routeKind, "proceed");
  assert.equal(assessingTransition.nextStage, "planning-remediation");

  const sharedTransition = resolveWorkflowOutcome(
    "converge-pre-remediation",
    "assessing-gaps",
    "findings_recorded",
  );
  assert.equal(sharedTransition.routeKind, "proceed");
  assert.equal(sharedTransition.nextStage, "planning-remediation");
  assert.ok(WORKFLOW_GRAPH["converge-pre-remediation"].stages["planning-remediation"]);
});

void test("smoke: legacy objective-assessing stage id is rejected by converge stage validator", () => {
  assert.throws(() => {
    validateConvergeStageResult({
      version: 1,
      stage: "objective-assessing" as never,
      status: "completed",
      route: { kind: "done" },
      data: { outcome_code: "no_gaps" },
    });
  }, /invalid converge stage result stage/i);
});

void test("smoke: assessing-gaps only evaluates normative target-spec sections", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: ["- Must enforce durable remediation snapshots for every converge review pass."],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const gap = await readJson<{
    findings: {
      objective_refs: string[];
      expected_behavior: string;
    }[];
  }>(join(repoRoot, ".praxis", "gap.json"));
  assert.ok(gap.findings.length > 0);
  for (const finding of gap.findings) {
    assert.ok(
      finding.objective_refs.every(
        (ref) =>
          !ref.includes("#clarification-status") &&
          !ref.includes("#references") &&
          !ref.includes("#imported-objective-content") &&
          !ref.includes("#scope") &&
          !ref.includes("#non-goals"),
      ),
      `finding references non-normative section: ${finding.objective_refs.join(", ")}`,
    );
    assert.doesNotMatch(finding.expected_behavior, /Needs clarification:/i);
  }
});

void test("smoke: converge pauses at clarifying-intent when objective is too vague", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: ["Ship it."],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "waiting_for_user");
  assert.equal(campaign.stop_reason_code, "needs_operator");
  assert.equal(campaign.current_pass, 0);
  assert.match(campaign.reason, /clarifying-intent requires objective refinement/i);

  const clarifyingResult = await readJson<{
    stage: string;
    route: { kind: string };
    data: {
      outcome_code: string;
      next_stage: string | null;
      clarification_issues: string[];
    };
  }>(join(repoRoot, ".praxis", "results", "clarifying-intent.json"));
  assert.equal(clarifyingResult.stage, "clarifying-intent");
  assert.equal(clarifyingResult.route.kind, "ask_user");
  assert.equal(clarifyingResult.data.outcome_code, "clarification_needed");
  assert.equal(clarifyingResult.data.next_stage, "clarifying-intent");
  assert.ok(clarifyingResult.data.clarification_issues.length > 0);
});

void test("smoke: clarifying-intent requires explicit normative acceptance criteria", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Document current converge architecture state.",
      "- Capture migration notes for future planning.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "architecture-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "waiting_for_user");
  assert.match(campaign.reason, /explicit normative acceptance criterion/i);

  const clarification = await readJson<{
    approval: { status: string; reasons: string[] };
    decisions: { acceptance_criteria: { items: string[] } };
  }>(join(repoRoot, ".praxis", "clarification.json"));
  assert.equal(clarification.approval.status, "needs_operator");
  assert.equal(clarification.decisions.acceptance_criteria.items.length, 0);
  assert.ok(clarification.approval.reasons.length > 0);
});

void test("smoke: clarifying-intent persists durable attempt history across retries", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: ["Ship it."],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const firstAttemptDir = join(repoRoot, ".praxis", "clarifications", "C-001");
  assert.equal(await exists(join(firstAttemptDir, "target-spec.md")), true);
  assert.equal(await exists(join(firstAttemptDir, "clarification.json")), true);
  const firstAttempt = await readJson<{ outcome_code: string; approval_status: string | null }>(
    join(firstAttemptDir, "attempt.json"),
  );
  assert.equal(firstAttempt.outcome_code, "clarification_needed");
  assert.equal(firstAttempt.approval_status, "needs_operator");

  await writeFile(
    join(repoRoot, objective),
    [
      "# Objective",
      "",
      "- Must persist converge clarification history as durable artifacts.",
      "- Must preserve latest target spec pointer while keeping historical clarification attempts.",
    ].join("\n"),
    "utf8",
  );

  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);
  const secondAttemptDir = join(repoRoot, ".praxis", "clarifications", "C-002");
  assert.equal(await exists(join(secondAttemptDir, "target-spec.md")), true);
  assert.equal(await exists(join(secondAttemptDir, "clarification.json")), true);
  const secondAttempt = await readJson<{ outcome_code: string; changed_decisions: string[] }>(
    join(secondAttemptDir, "attempt.json"),
  );
  assert.equal(secondAttempt.outcome_code, "target_spec_ready");
  assert.ok(secondAttempt.changed_decisions.length > 0);
});

void test("smoke: planning-remediation is assessment-driven without confidence hard gate", () => {
  const planned = planRemediation({
    campaignId: "campaign_test",
    passNumber: 1,
    reviewId: "R-001",
    latestAssessment: {
      version: 1,
      profile: "product-spec-gap",
      review_id: "R-001",
      target_spec_path: ".praxis/target-spec.md",
      generated_at: "2026-04-17T00:00:00.000Z",
      findings: [
        {
          finding_id: "G-001",
          fingerprint: "fp-001",
          title: "critical runtime gap",
          kind: "missing",
          severity: "critical",
          category: "runtime",
          summary: "Critical path is missing.",
          expected_behavior: "System enforces critical guard.",
          current_behavior: "Guard is absent.",
          evidence: ["src/runtime/core.ts:12 missing guard"],
          objective_refs: [".praxis/target-spec.md#acceptance-criteria"],
          affected_paths: ["src/runtime/core.ts"],
          recommended_direction: "Implement guard.",
          recommended_action: "Implement guard.",
          confidence: 0.2,
        },
      ],
    },
    severityThreshold: "high",
    maxFindingsPerPass: 1,
    maxStoriesPerPass: 1,
    generatedAt: "2026-04-17T00:00:00.000Z",
  });

  assert.deepEqual(planned.remediationMap.selected_finding_ids, ["G-001"]);
  assert.match(
    planned.remediationMap.selection.policy.join(" "),
    /assessment artifacts plus explicit campaign policy/i,
  );
});

void test("smoke: planning-remediation groups related findings when story budget is tight", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must enforce converge remediation contract coverage for bounded passes.",
      "- Must enforce converge remediation contract durability for bounded passes.",
      "- Must enforce converge remediation contract routing for bounded passes.",
      "- Must enforce converge remediation contract handoff for bounded passes.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "architecture-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 4,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const remediationMap = await readJson<{
    selected_finding_ids: string[];
    slices: {
      slice_id: string;
      finding_ids: string[];
    }[];
  }>(join(repoRoot, ".praxis", "remediation-map.json"));

  assert.ok(remediationMap.selected_finding_ids.length > 0);
  assert.ok(remediationMap.slices.length <= 2);
  assert.ok(
    remediationMap.slices.some((slice) => slice.finding_ids.length > 1),
    "expected at least one grouped remediation slice",
  );
});

void test("smoke: converge persists review snapshots with current stage naming", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must persist converge review history for each assessment pass.",
      "- Must keep latest gap and remediation map pointers in .praxis root.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "architecture-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const gap = await readJson<{ review_id: string }>(join(repoRoot, ".praxis", "gap.json"));
  const reviewDir = join(repoRoot, ".praxis", "reviews", gap.review_id);

  assert.equal(await exists(join(reviewDir, "gap.md")), true);
  assert.equal(await exists(join(reviewDir, "gap.json")), true);
  assert.equal(await exists(join(reviewDir, "remediation-map.md")), true);
  assert.equal(await exists(join(reviewDir, "remediation-map.json")), true);
  assert.equal(await exists(join(reviewDir, "results", "assessing-gaps.json")), true);
  assert.equal(await exists(join(reviewDir, "results", "planning-remediation.json")), true);
  assert.equal(await exists(join(reviewDir, "results", "objective-assessing.json")), false);
});

void test("smoke: gap assessment does not treat .plan-only matches as implementation closure", async () => {
  const repoRoot = await createTempRepo();
  const token = "architecture-shadow-closure-token-8842";
  const objective = await writeObjective(repoRoot, {
    lines: [`- Must enforce ${token} in runtime implementation before remediation can pass.`],
  });
  await writePlanningDoc(repoRoot, [
    `- Candidate implementation note: ${token}`,
    "- This note is planning-only and should not count as code evidence.",
  ]);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "architecture-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 3,
      maxStoriesPerPass: 3,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const gap = await readJson<{
    findings: {
      expected_behavior: string;
      current_behavior: string;
      evidence: string[];
      affected_paths: string[];
    }[];
  }>(join(repoRoot, ".praxis", "gap.json"));

  const tokenFinding = gap.findings.find((finding) => finding.expected_behavior.includes(token));
  assert.ok(tokenFinding, "expected a finding for the tokenized objective requirement");
  assert.match(
    tokenFinding.current_behavior,
    /executable behavior evidence|insufficient for closure/i,
  );
  assert.ok(
    tokenFinding.evidence.some((line) => /Coverage summary: behavior=/i.test(line)),
    "expected behavior coverage summary in evidence",
  );
  assert.ok(
    tokenFinding.evidence.some((line) => /Executable behavior probes were not found/i.test(line)),
    "expected explicit behavior-probe closure warning",
  );
  for (const evidenceLine of tokenFinding.evidence) {
    assert.doesNotMatch(evidenceLine, /\.plan/i);
  }
  assert.ok(
    tokenFinding.affected_paths.some((path) => path.startsWith("src/")),
    "affected paths should fall back to implementation surfaces",
  );
});

void test("smoke: commit-per-story is enforced at story boundary before continue", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must implement alpha remediation gate for campaign convergence.",
      "- Must implement beta remediation gate for campaign convergence.",
      "- Must implement gamma remediation gate for campaign convergence.",
    ],
  });
  await initGitRepo(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 3,
      maxStoriesPerPass: 3,
      scope: [],
      commitPerStory: true,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const initialRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  const firstStoryId = initialRun.current.slice_id;
  assert.ok(firstStoryId);
  const firstArtifactDir = `.praxis/slices/${firstStoryId}`;

  await submitStage(repoRoot, "clarifying-intent", firstArtifactDir, "story_spec_ready", "proceed");
  await submitStage(repoRoot, "sketching-design", firstArtifactDir, "sketch_skipped", "proceed");
  await submitStage(repoRoot, "driving-tdd", firstArtifactDir, "tdd_complete", "proceed");
  await submitStage(repoRoot, "code-reviewing", firstArtifactDir, "review_skipped", "proceed");
  await submitStage(
    repoRoot,
    "verifying-and-adapting",
    firstArtifactDir,
    "next_slice",
    "next_slice",
  );

  const gatedRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(gatedRun.status, "waiting_for_user");
  assert.equal(gatedRun.routing.stop_reason_code, "commit_per_story_required");
  assert.equal(gatedRun.workflow_constraints?.commit_per_story?.pending_story_id, firstStoryId);

  assert.equal(await runContinueCommand(repoRoot, true), EXIT_CODE.REJECTED);

  await writeFile(join(repoRoot, `story-${firstStoryId}.txt`), `${firstStoryId}\n`, "utf8");
  await execFileAsync("git", ["add", `story-${firstStoryId}.txt`], { cwd: repoRoot });
  await execFileAsync(
    "git",
    ["-c", "commit.gpgsign=false", "commit", "-m", `commit ${firstStoryId}`],
    { cwd: repoRoot },
  );

  assert.equal(await runContinueCommand(repoRoot, true), EXIT_CODE.OK);
  const resumedRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(resumedRun.workflow_constraints?.commit_per_story?.pending_story_id, null);
});

void test("smoke: converge blocks when child run slot ownership no longer matches run state", async () => {
  const repoRoot = await createTempRepo();
  const objective = await writeObjective(repoRoot, {
    lines: [
      "- Must implement delta987 reconciliation sentinel for pass ownership.",
      "- Must persist epsilon-slot handshake across converge launches.",
    ],
  });

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false,
    }),
    EXIT_CODE.OK,
  );

  const childRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  childRun.run_id = "run_replaced_by_external_process";
  await writeFile(
    join(repoRoot, ".praxis", "run.json"),
    `${JSON.stringify(childRun, null, 2)}\n`,
    "utf8",
  );

  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "blocked");
  assert.match(campaign.reason, /child-run slot validation failed/i);
});
