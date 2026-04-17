import type { PermissionProfile, StageName } from "../../contracts/model.js";
import {
  resolveStageProfile,
  resolveStageRestrictsNetwork,
} from "../../workflows/stage-definitions.js";

export interface ToolPolicy {
  writable_roots: string[];
  blocked_paths: string[];
  network: "enabled" | "restricted";
  profile: PermissionProfile;
}

export function buildToolPolicy(stage: StageName): ToolPolicy {
  return {
    writable_roots: ["."],
    blocked_paths: [".git", ".env"],
    network: resolveStageRestrictsNetwork(stage) ? "restricted" : "enabled",
    profile: resolveStageProfile(stage),
  };
}
