import type { PermissionProfile, StageName, WorkflowName } from "../contracts/model.js";

// Stage metadata lives in one place so adding a stage is a single-file change. Each entry
// carries the tool-permission profile, whether the stage restricts network access, the
// instructions surfaced to the worker, and a default goal. Workflow-specific goal
// overrides live in WORKFLOW_STAGE_GOAL_OVERRIDES and fall back to the default.

export interface StageDefinition {
  profile: PermissionProfile;
  restrictsNetwork: boolean;
  instructions: readonly string[];
  defaultGoal: string;
}

export const STAGE_DEFINITIONS: Record<StageName, StageDefinition> = {
  "clarifying-intent": {
    profile: "planning",
    restrictsNetwork: false,
    defaultGoal:
      "Clarify the current story boundary and produce the authoritative next artifact.",
    instructions: [
      "Use only dispatch-approved artifacts and any active boundary handoff.",
      "Decide whether the work is a brief, a story spec, or user clarification.",
      "Write the human-readable artifact and the machine-readable stage result.",
    ],
  },
  "assessing-gaps": {
    profile: "planning",
    restrictsNetwork: false,
    defaultGoal: "Execute assessing-gaps for the active workflow.",
    instructions: [
      "Assess implementation behavior against the active target spec.",
      "Persist both Markdown and JSON gap artifacts.",
      "Write a converge stage result with deterministic routing metadata.",
    ],
  },
  "planning-remediation": {
    profile: "planning",
    restrictsNetwork: false,
    defaultGoal: "Execute planning-remediation for the active workflow.",
    instructions: [
      "Plan from the latest gap assessment artifacts only.",
      "Persist selected and deferred findings with bounded remediation slices.",
      "Write a converge stage result with deterministic routing metadata.",
    ],
  },
  "slicing-stories": {
    profile: "planning",
    restrictsNetwork: false,
    defaultGoal: "Split the feature brief into a durable slice map and activate the first slice.",
    instructions: [
      "Read the feature brief only from durable artifacts.",
      "Produce both JSON and Markdown slice maps.",
      "Write a stage result that lets the workflow activate the first slice.",
    ],
  },
  "sketching-design": {
    profile: "design",
    restrictsNetwork: false,
    defaultGoal:
      "Map the approved spec to the codebase and produce the minimal design sketch needed for implementation.",
    instructions: [
      "Keep the design bounded to the active story scope.",
      "Prefer existing code patterns over novel architecture.",
      "Write the sketch artifact only when it adds value.",
    ],
  },
  "driving-tdd": {
    profile: "implementation",
    restrictsNetwork: false,
    defaultGoal:
      "Drive the approved story through implementation and capture the resulting implementation summary.",
    instructions: [
      "Work only from the approved spec and declared inputs.",
      "Produce the implementation artifact and stage result.",
      "Stop when the bounded assignment is complete or blocked.",
    ],
  },
  "code-reviewing": {
    profile: "review",
    restrictsNetwork: true,
    defaultGoal:
      "Review the implementation in a fresh, bounded session against the current shared worktree.",
    instructions: [
      "Review only the bounded implementation scope.",
      "Use the current target worktree and a fresh Praxis-owned session.",
      "Write the review artifact and stage result.",
    ],
  },
  "code-improving": {
    profile: "implementation",
    restrictsNetwork: false,
    defaultGoal: "Apply the review findings and capture the improvement artifact.",
    instructions: [
      "Apply review-backed improvements only.",
      "Do not widen scope beyond the active story.",
      "Write the improvement artifact and stage result.",
    ],
  },
  "verifying-and-adapting": {
    profile: "verification",
    restrictsNetwork: true,
    defaultGoal:
      "Verify the completed story against the spec and adapt or escalate based on the result.",
    instructions: [
      "Verify the current story against the durable spec and outputs.",
      "Route to done, rework, next slice, or escalation through the stage result.",
      "Keep the verification bounded to declared artifacts.",
    ],
  },
};

type WorkflowStageGoalOverrides = Partial<Record<WorkflowName, Partial<Record<StageName, string>>>>;

const WORKFLOW_STAGE_GOAL_OVERRIDES: WorkflowStageGoalOverrides = {
  craft: {
    "clarifying-intent":
      "Clarify the current craft story boundary and produce the authoritative next artifact.",
  },
  "converge-pre-remediation": {
    "clarifying-intent":
      "Clarify and persist an operator-ready target spec for objective-driven remediation.",
    "assessing-gaps":
      "Assess implementation gaps against the active target spec and persist durable findings.",
    "planning-remediation":
      "Select bounded remediation slices from assessed findings and persist a remediation map.",
  },
};

export function resolveStageProfile(stage: StageName): PermissionProfile {
  return STAGE_DEFINITIONS[stage].profile;
}

export function resolveStageRestrictsNetwork(stage: StageName): boolean {
  return STAGE_DEFINITIONS[stage].restrictsNetwork;
}

export function resolveStageInstructions(stage: StageName): readonly string[] {
  return STAGE_DEFINITIONS[stage].instructions;
}

export function resolveStageGoal(workflow: WorkflowName, stage: StageName): string {
  return (
    WORKFLOW_STAGE_GOAL_OVERRIDES[workflow]?.[stage] ?? STAGE_DEFINITIONS[stage].defaultGoal
  );
}
