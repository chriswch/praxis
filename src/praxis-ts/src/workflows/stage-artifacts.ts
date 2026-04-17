import { join } from "node:path";
import type { StageName, WorkflowName } from "../contracts/model.js";

type TransitionContext = {
  from_stage: StageName | null;
  from_outcome_code: string | null;
};

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function resultPath(artifactDir: string, stage: StageName): string {
  return toPosix(join(artifactDir, "results", `${stage}.json`));
}

export function expectedInputArtifactsForStage(
  stage: StageName,
  artifactDir: string,
  clarifyingRequiredArtifacts: string[],
  workflow: WorkflowName = "craft",
): string[] {
  if (workflow === "converge-pre-remediation") {
    if (stage === "clarifying-intent") {
      return [".praxis/objective.md"];
    }
    if (stage === "assessing-gaps") {
      return [".praxis/target-spec.md", ".praxis/clarification.json"];
    }
    if (stage === "planning-remediation") {
      return [".praxis/gap.json"];
    }
  }

  if (stage === "clarifying-intent") {
    return clarifyingRequiredArtifacts;
  }
  if (stage === "slicing-stories") {
    return [".praxis/brief.md"];
  }
  if (stage === "sketching-design" || stage === "driving-tdd") {
    return [toPosix(join(artifactDir, "spec.md"))];
  }
  if (stage === "code-improving") {
    return [toPosix(join(artifactDir, "review.md"))];
  }
  return [];
}

export function expectedInputArtifactsForTransition(
  stage: StageName,
  artifactDir: string,
  transition: TransitionContext,
  clarifyingRequiredArtifacts: string[],
  workflow: WorkflowName = "craft",
): string[] {
  if (workflow === "converge-pre-remediation") {
    if (stage === "clarifying-intent") {
      return [".praxis/objective.md"];
    }
    if (stage === "assessing-gaps") {
      return [".praxis/target-spec.md", ".praxis/clarification.json"];
    }
    if (stage === "planning-remediation") {
      return [".praxis/gap.json"];
    }
  }

  if (stage === "clarifying-intent") {
    return clarifyingRequiredArtifacts;
  }
  if (stage === "slicing-stories") {
    return [".praxis/brief.md"];
  }
  if (stage === "sketching-design" || stage === "driving-tdd") {
    return [toPosix(join(artifactDir, "spec.md"))];
  }
  if (stage === "code-reviewing") {
    return [toPosix(join(artifactDir, "implementation.md"))];
  }
  if (stage === "code-improving") {
    return [toPosix(join(artifactDir, "review.md"))];
  }
  if (stage === "verifying-and-adapting") {
    if (
      transition.from_stage === "code-reviewing" &&
      transition.from_outcome_code === "review_skipped"
    ) {
      return [toPosix(join(artifactDir, "review.md"))];
    }
    if (
      transition.from_stage === "code-improving" &&
      (transition.from_outcome_code === "improvement_ready" ||
        transition.from_outcome_code === "improvement_skipped")
    ) {
      return [toPosix(join(artifactDir, "improvement.md"))];
    }
    return [toPosix(join(artifactDir, "improvement.md"))];
  }
  return [];
}

export function expectedContractOutputArtifacts(
  stage: StageName,
  artifactDir: string,
  workflow: WorkflowName = "craft",
): string[] {
  if (workflow === "converge-pre-remediation") {
    switch (stage) {
      case "clarifying-intent":
        return [
          ".praxis/target-spec.md",
          ".praxis/clarification.json",
          resultPath(".praxis", stage),
        ];
      case "assessing-gaps":
        return [".praxis/gap.md", ".praxis/gap.json", resultPath(".praxis", stage)];
      case "planning-remediation":
        return [
          ".praxis/remediation-map.md",
          ".praxis/remediation-map.json",
          resultPath(".praxis", stage),
        ];
      default:
        return [];
    }
  }

  switch (stage) {
    case "clarifying-intent":
      return [toPosix(join(artifactDir, "spec.md")), resultPath(artifactDir, stage)];
    case "assessing-gaps":
    case "planning-remediation":
      return [];
    case "slicing-stories":
      return [".praxis/slice-map.json", ".praxis/slice-map.md", resultPath(".praxis", stage)];
    case "sketching-design":
      return [toPosix(join(artifactDir, "sketch.md")), resultPath(artifactDir, stage)];
    case "driving-tdd":
      return [toPosix(join(artifactDir, "implementation.md")), resultPath(artifactDir, stage)];
    case "code-reviewing":
      return [toPosix(join(artifactDir, "review.md")), resultPath(artifactDir, stage)];
    case "code-improving":
      return [toPosix(join(artifactDir, "improvement.md")), resultPath(artifactDir, stage)];
    case "verifying-and-adapting":
      return [toPosix(join(artifactDir, "verification.md")), resultPath(artifactDir, stage)];
  }
}

export function primaryContractOutputArtifact(
  stage: StageName,
  artifactDir: string,
  workflow: WorkflowName = "craft",
): string | null {
  if (workflow === "converge-pre-remediation") {
    switch (stage) {
      case "clarifying-intent":
        return ".praxis/target-spec.md";
      case "assessing-gaps":
        return ".praxis/gap.md";
      case "planning-remediation":
        return ".praxis/remediation-map.md";
      default:
        return null;
    }
  }

  switch (stage) {
    case "clarifying-intent":
      return toPosix(join(artifactDir, "spec.md"));
    case "assessing-gaps":
    case "planning-remediation":
      return null;
    case "slicing-stories":
      return ".praxis/slice-map.md";
    case "sketching-design":
      return toPosix(join(artifactDir, "sketch.md"));
    case "driving-tdd":
      return toPosix(join(artifactDir, "implementation.md"));
    case "code-reviewing":
      return toPosix(join(artifactDir, "review.md"));
    case "code-improving":
      return toPosix(join(artifactDir, "improvement.md"));
    case "verifying-and-adapting":
      return toPosix(join(artifactDir, "verification.md"));
  }
}

export function expectedOutcomeArtifacts(
  stage: StageName,
  artifactDir: string,
  outcomeCode: string,
  workflow: WorkflowName = "craft",
): string[] {
  if (workflow === "converge-pre-remediation") {
    switch (stage) {
      case "clarifying-intent":
        return [".praxis/target-spec.md", ".praxis/clarification.json"];
      case "assessing-gaps":
        return [".praxis/gap.md", ".praxis/gap.json"];
      case "planning-remediation":
        return [".praxis/remediation-map.md", ".praxis/remediation-map.json"];
      default:
        return [];
    }
  }

  switch (stage) {
    case "clarifying-intent":
      if (outcomeCode === "feature_brief_ready") {
        return [".praxis/brief.md"];
      }
      if (outcomeCode === "story_spec_ready" || outcomeCode === "bug_fix_ready") {
        return [toPosix(join(artifactDir, "spec.md"))];
      }
      return [];
    case "assessing-gaps":
    case "planning-remediation":
      return [];
    case "slicing-stories":
      return [".praxis/slice-map.md", ".praxis/slice-map.json"];
    case "sketching-design":
      return outcomeCode === "sketch_ready" ? [toPosix(join(artifactDir, "sketch.md"))] : [];
    case "driving-tdd":
      return [toPosix(join(artifactDir, "implementation.md"))];
    case "code-reviewing":
      return [toPosix(join(artifactDir, "review.md"))];
    case "code-improving":
      return [toPosix(join(artifactDir, "improvement.md"))];
    case "verifying-and-adapting":
      return [toPosix(join(artifactDir, "verification.md"))];
  }
}
