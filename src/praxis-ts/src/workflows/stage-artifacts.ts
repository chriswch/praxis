import { join } from "node:path";
import type { StageName, WorkflowName } from "../contracts/model.js";

interface TransitionContext {
  from_stage: StageName | null;
  from_outcome_code: string | null;
}

interface ArtifactResolverContext {
  artifactDir: string;
  clarifyingRequired: string[];
}

type ArtifactResolver = (context: ArtifactResolverContext) => string[];
type PrimaryOutputResolver = (context: ArtifactResolverContext) => string | null;

interface TransitionOverride {
  match: (transition: TransitionContext) => boolean;
  inputs: ArtifactResolver;
}

interface StageArtifactSpec {
  inputs: ArtifactResolver;
  outputs: ArtifactResolver;
  primaryOutput: PrimaryOutputResolver;
  outcomeArtifacts: Partial<Record<string, ArtifactResolver>>;
  outcomeArtifactsDefault: ArtifactResolver;
  transitionInputs?: TransitionOverride[];
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function resultPath(artifactDir: string, stage: StageName): string {
  return toPosix(join(artifactDir, "results", `${stage}.json`));
}

function slicePath(artifactDir: string, filename: string): string {
  return toPosix(join(artifactDir, filename));
}

function empty(): string[] {
  return [];
}

const CRAFT_STAGE_ARTIFACTS: Partial<Record<StageName, StageArtifactSpec>> = {
  "clarifying-intent": {
    inputs: ({ clarifyingRequired }) => clarifyingRequired,
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "spec.md"),
      resultPath(artifactDir, "clarifying-intent"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "spec.md"),
    outcomeArtifacts: {
      feature_brief_ready: () => [".praxis/brief.md"],
      story_spec_ready: ({ artifactDir }) => [slicePath(artifactDir, "spec.md")],
      bug_fix_ready: ({ artifactDir }) => [slicePath(artifactDir, "spec.md")],
    },
    outcomeArtifactsDefault: empty,
  },
  "slicing-stories": {
    inputs: () => [".praxis/brief.md"],
    outputs: () => [
      ".praxis/slice-map.json",
      ".praxis/slice-map.md",
      resultPath(".praxis", "slicing-stories"),
    ],
    primaryOutput: () => ".praxis/slice-map.md",
    outcomeArtifacts: {},
    outcomeArtifactsDefault: () => [".praxis/slice-map.md", ".praxis/slice-map.json"],
  },
  "sketching-design": {
    inputs: ({ artifactDir }) => [slicePath(artifactDir, "spec.md")],
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "sketch.md"),
      resultPath(artifactDir, "sketching-design"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "sketch.md"),
    outcomeArtifacts: {
      sketch_ready: ({ artifactDir }) => [slicePath(artifactDir, "sketch.md")],
    },
    outcomeArtifactsDefault: empty,
  },
  "driving-tdd": {
    inputs: ({ artifactDir }) => [slicePath(artifactDir, "spec.md")],
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "implementation.md"),
      resultPath(artifactDir, "driving-tdd"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "implementation.md"),
    outcomeArtifacts: {},
    outcomeArtifactsDefault: ({ artifactDir }) => [slicePath(artifactDir, "implementation.md")],
  },
  "code-reviewing": {
    inputs: empty,
    transitionInputs: [
      {
        match: () => true,
        inputs: ({ artifactDir }) => [slicePath(artifactDir, "implementation.md")],
      },
    ],
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "review.md"),
      resultPath(artifactDir, "code-reviewing"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "review.md"),
    outcomeArtifacts: {},
    outcomeArtifactsDefault: ({ artifactDir }) => [slicePath(artifactDir, "review.md")],
  },
  "code-improving": {
    inputs: ({ artifactDir }) => [slicePath(artifactDir, "review.md")],
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "improvement.md"),
      resultPath(artifactDir, "code-improving"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "improvement.md"),
    outcomeArtifacts: {},
    outcomeArtifactsDefault: ({ artifactDir }) => [slicePath(artifactDir, "improvement.md")],
  },
  "verifying-and-adapting": {
    inputs: empty,
    transitionInputs: [
      {
        match: (t) => t.from_stage === "code-reviewing" && t.from_outcome_code === "review_skipped",
        inputs: ({ artifactDir }) => [slicePath(artifactDir, "review.md")],
      },
      {
        match: (t) =>
          t.from_stage === "code-improving" &&
          (t.from_outcome_code === "improvement_ready" ||
            t.from_outcome_code === "improvement_skipped"),
        inputs: ({ artifactDir }) => [slicePath(artifactDir, "improvement.md")],
      },
      {
        match: () => true,
        inputs: ({ artifactDir }) => [slicePath(artifactDir, "improvement.md")],
      },
    ],
    outputs: ({ artifactDir }) => [
      slicePath(artifactDir, "verification.md"),
      resultPath(artifactDir, "verifying-and-adapting"),
    ],
    primaryOutput: ({ artifactDir }) => slicePath(artifactDir, "verification.md"),
    outcomeArtifacts: {},
    outcomeArtifactsDefault: ({ artifactDir }) => [slicePath(artifactDir, "verification.md")],
  },
};

const CONVERGE_STAGE_ARTIFACTS: Partial<Record<StageName, StageArtifactSpec>> = {
  "clarifying-intent": {
    inputs: () => [".praxis/objective.md"],
    outputs: () => [
      ".praxis/target-spec.md",
      ".praxis/clarification.json",
      resultPath(".praxis", "clarifying-intent"),
    ],
    primaryOutput: () => ".praxis/target-spec.md",
    outcomeArtifacts: {},
    outcomeArtifactsDefault: () => [".praxis/target-spec.md", ".praxis/clarification.json"],
  },
  "assessing-gaps": {
    inputs: () => [".praxis/target-spec.md", ".praxis/clarification.json"],
    outputs: () => [".praxis/gap.md", ".praxis/gap.json", resultPath(".praxis", "assessing-gaps")],
    primaryOutput: () => ".praxis/gap.md",
    outcomeArtifacts: {},
    outcomeArtifactsDefault: () => [".praxis/gap.md", ".praxis/gap.json"],
  },
  "planning-remediation": {
    inputs: () => [".praxis/gap.json"],
    outputs: () => [
      ".praxis/remediation-map.md",
      ".praxis/remediation-map.json",
      resultPath(".praxis", "planning-remediation"),
    ],
    primaryOutput: () => ".praxis/remediation-map.md",
    outcomeArtifacts: {},
    outcomeArtifactsDefault: () => [".praxis/remediation-map.md", ".praxis/remediation-map.json"],
  },
};

const STAGE_ARTIFACTS_BY_WORKFLOW: Record<
  WorkflowName,
  Partial<Record<StageName, StageArtifactSpec>>
> = {
  craft: CRAFT_STAGE_ARTIFACTS,
  "converge-pre-remediation": CONVERGE_STAGE_ARTIFACTS,
};

function getSpec(
  stage: StageName,
  workflow: WorkflowName,
): StageArtifactSpec | undefined {
  return STAGE_ARTIFACTS_BY_WORKFLOW[workflow][stage];
}

export function expectedInputArtifactsForStage(
  stage: StageName,
  artifactDir: string,
  clarifyingRequiredArtifacts: string[],
  workflow: WorkflowName = "craft",
): string[] {
  const spec = getSpec(stage, workflow);
  if (!spec) {
    return [];
  }
  return spec.inputs({ artifactDir, clarifyingRequired: clarifyingRequiredArtifacts });
}

export function expectedInputArtifactsForTransition(
  stage: StageName,
  artifactDir: string,
  transition: TransitionContext,
  clarifyingRequiredArtifacts: string[],
  workflow: WorkflowName = "craft",
): string[] {
  const spec = getSpec(stage, workflow);
  if (!spec) {
    return [];
  }
  const context: ArtifactResolverContext = {
    artifactDir,
    clarifyingRequired: clarifyingRequiredArtifacts,
  };
  if (spec.transitionInputs) {
    for (const override of spec.transitionInputs) {
      if (override.match(transition)) {
        return override.inputs(context);
      }
    }
  }
  return spec.inputs(context);
}

export function expectedContractOutputArtifacts(
  stage: StageName,
  artifactDir: string,
  workflow: WorkflowName = "craft",
): string[] {
  const spec = getSpec(stage, workflow);
  if (!spec) {
    return [];
  }
  return spec.outputs({ artifactDir, clarifyingRequired: [] });
}

export function primaryContractOutputArtifact(
  stage: StageName,
  artifactDir: string,
  workflow: WorkflowName = "craft",
): string | null {
  const spec = getSpec(stage, workflow);
  if (!spec) {
    return null;
  }
  return spec.primaryOutput({ artifactDir, clarifyingRequired: [] });
}

export function expectedOutcomeArtifacts(
  stage: StageName,
  artifactDir: string,
  outcomeCode: string,
  workflow: WorkflowName = "craft",
): string[] {
  const spec = getSpec(stage, workflow);
  if (!spec) {
    return [];
  }
  const context: ArtifactResolverContext = { artifactDir, clarifyingRequired: [] };
  const override = spec.outcomeArtifacts[outcomeCode];
  if (override) {
    return override(context);
  }
  return spec.outcomeArtifactsDefault(context);
}
