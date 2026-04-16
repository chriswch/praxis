import type { StageName } from "../../contracts/model.js";

export type ToolPolicy = {
  writable_roots: string[];
  blocked_paths: string[];
  network: "enabled" | "restricted";
  profile: "planning" | "design" | "implementation" | "review" | "verification";
};

function stageToProfile(stage: StageName): ToolPolicy["profile"] {
  switch (stage) {
    case "clarifying-intent":
    case "slicing-stories":
      return "planning";
    case "sketching-design":
      return "design";
    case "driving-tdd":
    case "code-improving":
      return "implementation";
    case "code-reviewing":
      return "review";
    case "verifying-and-adapting":
      return "verification";
  }
}

export function buildToolPolicy(stage: StageName): ToolPolicy {
  const reviewLikeStage = stage === "code-reviewing" || stage === "verifying-and-adapting";
  return {
    writable_roots: ["."],
    blocked_paths: [".git", ".env"],
    network: reviewLikeStage ? "restricted" : "enabled",
    profile: stageToProfile(stage)
  };
}
