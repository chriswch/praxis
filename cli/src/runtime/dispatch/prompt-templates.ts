import type { StageName, WorkflowName } from "../../contracts/model.js";
import { resolveStageSlashCommand } from "./stage-dispatch.js";

// Describes one dispatch from the CLI to a worker. The CLI owns every field;
// nothing in the plugin constructs this payload.
export interface DispatchPromptInput {
  stage: StageName;
  workflow: WorkflowName;
  stageGoal: string;
  stageInstructions: readonly string[];
  inputs: {
    requiredArtifacts: readonly string[];
    // Path to the JSON input envelope the CLI has already staged (see
    // input-stager.ts). Null when the stage carries no envelope.
    inputEnvelopePath: string | null;
  };
  outputs: {
    expectedArtifacts: readonly string[];
    primaryOutput: string | null;
    // Path the worker is expected to write its JSON output to (see
    // output-parser.ts). Null when the stage writes legacy artifacts instead.
    outputEnvelopePath: string | null;
  };
  // Stage-specific context the CLI wants to inline verbatim. This bag is
  // opaque to the dispatch module; each stage decides what it contains.
  extraContext: Record<string, unknown>;
  // Optional structural hint inlined into the prompt so workers see the
  // expected output shape at dispatch time instead of reading a schema file.
  expectedOutputShape?: string;
}

// Build the prompt handed to a worker subprocess. Slash-command stages prepend
// `/praxis:<stage>`; non-slash stages (the CLI-private ones) begin with a
// `Stage:` header instead.
export function buildDispatchPrompt(payload: DispatchPromptInput): string {
  const slashCommand = resolveStageSlashCommand(payload.stage);
  const header =
    slashCommand !== null ? [slashCommand, ""] : [`Stage: ${payload.stage}`, ""];

  const inputsSection = [
    "Required inputs:",
    ...(payload.inputs.requiredArtifacts.length === 0
      ? ["- (none)"]
      : payload.inputs.requiredArtifacts.map((item) => `- ${item}`)),
  ];
  if (payload.inputs.inputEnvelopePath !== null) {
    inputsSection.push(`Input envelope: ${payload.inputs.inputEnvelopePath}`);
  }

  const outputsSection = [
    "Required outputs (write these files):",
    ...(payload.outputs.expectedArtifacts.length === 0
      ? ["- (none)"]
      : payload.outputs.expectedArtifacts.map((item) => `- ${item}`)),
    `Primary output: ${payload.outputs.primaryOutput ?? "(none)"}`,
  ];
  if (payload.outputs.outputEnvelopePath !== null) {
    outputsSection.push(`Output envelope: ${payload.outputs.outputEnvelopePath}`);
  }

  const shapeSection =
    payload.expectedOutputShape === undefined
      ? []
      : ["", "Expected output shape:", "```", payload.expectedOutputShape, "```"];

  const lines = [
    ...header,
    `You are executing the ${payload.stage} stage of the ${payload.workflow} workflow.`,
    "",
    `Stage goal: ${payload.stageGoal}`,
    "",
    "Stage instructions:",
    ...payload.stageInstructions.map((item) => `- ${item}`),
    "",
    ...inputsSection,
    "",
    ...outputsSection,
    ...shapeSection,
    "",
    "Extra context:",
    "```json",
    JSON.stringify(payload.extraContext, null, 2),
    "```",
    "",
    "Produce the artifacts listed above and exit. Do not ask for clarification from the user unless the inputs are missing or contradictory.",
  ];
  return lines.join("\n");
}
