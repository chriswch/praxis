import type { DispatchRecord, StageName, WorkflowName } from "../../contracts/model.js";
import {
  expectedContractOutputArtifacts,
  primaryContractOutputArtifact,
} from "../../workflows/stage-artifacts.js";

type StageContract = DispatchRecord["contract"];

function stageGoal(workflow: WorkflowName, stage: StageName): string {
  if (workflow === "converge-pre-remediation") {
    switch (stage) {
      case "clarifying-intent":
        return "Clarify and persist an operator-ready target spec for objective-driven remediation.";
      case "assessing-gaps":
        return "Assess implementation gaps against the active target spec and persist durable findings.";
      case "planning-remediation":
        return "Select bounded remediation slices from assessed findings and persist a remediation map.";
      default:
        return `Execute ${stage} for workflow ${workflow}.`;
    }
  }

  switch (stage) {
    case "clarifying-intent":
      return `Clarify the current ${workflow} story boundary and produce the authoritative next artifact.`;
    case "assessing-gaps":
    case "planning-remediation":
      return `Execute ${stage} for workflow ${workflow}.`;
    case "slicing-stories":
      return "Split the feature brief into a durable slice map and activate the first slice.";
    case "sketching-design":
      return "Map the approved spec to the codebase and produce the minimal design sketch needed for implementation.";
    case "driving-tdd":
      return "Drive the approved story through implementation and capture the resulting implementation summary.";
    case "code-reviewing":
      return "Review the implementation in a fresh, bounded session against the current shared worktree.";
    case "code-improving":
      return "Apply the review findings and capture the improvement artifact.";
    case "verifying-and-adapting":
      return "Verify the completed story against the spec and adapt or escalate based on the result.";
  }
}

function stageInstructions(stage: StageName): string[] {
  switch (stage) {
    case "clarifying-intent":
      return [
        "Use only dispatch-approved artifacts and any active boundary handoff.",
        "Decide whether the work is a brief, a story spec, or user clarification.",
        "Write the human-readable artifact and the machine-readable stage result.",
      ];
    case "assessing-gaps":
      return [
        "Assess implementation behavior against the active target spec.",
        "Persist both Markdown and JSON gap artifacts.",
        "Write a converge stage result with deterministic routing metadata.",
      ];
    case "planning-remediation":
      return [
        "Plan from the latest gap assessment artifacts only.",
        "Persist selected and deferred findings with bounded remediation slices.",
        "Write a converge stage result with deterministic routing metadata.",
      ];
    case "slicing-stories":
      return [
        "Read the feature brief only from durable artifacts.",
        "Produce both JSON and Markdown slice maps.",
        "Write a stage result that lets the workflow activate the first slice.",
      ];
    case "sketching-design":
      return [
        "Keep the design bounded to the active story scope.",
        "Prefer existing code patterns over novel architecture.",
        "Write the sketch artifact only when it adds value.",
      ];
    case "driving-tdd":
      return [
        "Work only from the approved spec and declared inputs.",
        "Produce the implementation artifact and stage result.",
        "Stop when the bounded assignment is complete or blocked.",
      ];
    case "code-reviewing":
      return [
        "Review only the bounded implementation scope.",
        "Use the current target worktree and a fresh Praxis-owned session.",
        "Write the review artifact and stage result.",
      ];
    case "code-improving":
      return [
        "Apply review-backed improvements only.",
        "Do not widen scope beyond the active story.",
        "Write the improvement artifact and stage result.",
      ];
    case "verifying-and-adapting":
      return [
        "Verify the current story against the durable spec and outputs.",
        "Route to done, rework, next slice, or escalation through the stage result.",
        "Keep the verification bounded to declared artifacts.",
      ];
  }
}

export function buildStageContract(
  workflow: WorkflowName,
  stage: StageName,
  artifactDir: string,
): StageContract {
  return {
    stage_goal: stageGoal(workflow, stage),
    stage_instructions: stageInstructions(stage),
    expected_output_artifacts: expectedContractOutputArtifacts(stage, artifactDir, workflow),
    primary_output: primaryContractOutputArtifact(stage, artifactDir, workflow),
  };
}
