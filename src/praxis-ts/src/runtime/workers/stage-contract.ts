import type { DispatchRecord, StageName, WorkflowName } from "../../contracts/model.js";
import {
  expectedContractOutputArtifacts,
  primaryContractOutputArtifact,
} from "../../workflows/stage-artifacts.js";
import {
  resolveStageGoal,
  resolveStageInstructions,
} from "../../workflows/stage-definitions.js";

type StageContract = DispatchRecord["contract"];

export function buildStageContract(
  workflow: WorkflowName,
  stage: StageName,
  artifactDir: string,
): StageContract {
  return {
    stage_goal: resolveStageGoal(workflow, stage),
    stage_instructions: [...resolveStageInstructions(stage)],
    expected_output_artifacts: expectedContractOutputArtifacts(stage, artifactDir, workflow),
    primary_output: primaryContractOutputArtifact(stage, artifactDir, workflow),
  };
}
