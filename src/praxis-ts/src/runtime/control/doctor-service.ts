import { exists } from "../state/store.js";
import { getAllAdapters } from "../adapters/index.js";
import { resolvePraxisPaths } from "../state/paths.js";
import {
  buildInstructionSurfaceManifest,
  selectInstructionSurfaces,
} from "../workers/context-manifest.js";
import { EXIT_CODE } from "../../cli/exit-codes.js";

export interface DoctorReport {
  repo_root: string;
  runtime: {
    node: string;
    platform: string;
    praxis_dir_exists: boolean;
    repo_is_git: boolean;
    instruction_surfaces: ReturnType<typeof buildInstructionSurfaceManifest>;
  };
  adapters: {
    adapter: string;
    healthy: boolean;
    supports_resume: boolean;
    reason: string;
    binary: string | null;
    version: string | null;
    instruction_surfaces_found: string[];
  }[];
  recoverability: {
    has_run_manifest: boolean;
    has_event_log: boolean;
    has_dispatch_directory: boolean;
    has_session_directory: boolean;
    has_worktree_directory: boolean;
    integrity: "healthy" | "warning";
  };
  summary: {
    healthy: boolean;
    exit_code: number;
    reasons: string[];
  };
}

export async function buildDoctorReport(repoRoot: string): Promise<DoctorReport> {
  const paths = resolvePraxisPaths(repoRoot);
  const instructionSurfaces = buildInstructionSurfaceManifest(repoRoot);

  const adapters = await Promise.all(
    getAllAdapters().map(async (adapter) => {
      const health = await adapter.health();
      return {
        adapter: health.adapter,
        healthy: health.healthy,
        supports_resume: health.supports_resume,
        reason: health.reason,
        binary: health.binary,
        version: health.version,
        instruction_surfaces_found: selectInstructionSurfaces(
          instructionSurfaces,
          health.adapter,
        ).map((surface) => surface.path),
      };
    }),
  );

  const [
    praxisDirExists,
    hasRunManifest,
    hasEventLog,
    hasDispatchDirectory,
    hasSessionDirectory,
    hasWorktreeDirectory,
    repoIsGit,
  ] = await Promise.all([
    exists(paths.praxisDir),
    exists(paths.runFile),
    exists(paths.eventsFile),
    exists(paths.dispatchesDir),
    exists(paths.sessionsDir),
    exists(paths.worktreesDir),
    exists(`${repoRoot}/.git`),
  ]);

  const integrity =
    !praxisDirExists ||
    (hasDispatchDirectory &&
      hasSessionDirectory &&
      hasWorktreeDirectory &&
      (hasRunManifest || hasEventLog))
      ? "healthy"
      : "warning";
  const reasons = [
    ...adapters
      .filter((adapter) => !adapter.healthy)
      .map((adapter) => `${adapter.adapter}: ${adapter.reason}`),
    ...(integrity === "warning"
      ? ["runtime_integrity: .praxis layout is incomplete for durable recovery."]
      : []),
  ];
  const healthy = reasons.length === 0;

  return {
    repo_root: repoRoot,
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      praxis_dir_exists: praxisDirExists,
      repo_is_git: repoIsGit,
      instruction_surfaces: instructionSurfaces,
    },
    adapters,
    recoverability: {
      has_run_manifest: hasRunManifest,
      has_event_log: hasEventLog,
      has_dispatch_directory: hasDispatchDirectory,
      has_session_directory: hasSessionDirectory,
      has_worktree_directory: hasWorktreeDirectory,
      integrity,
    },
    summary: {
      healthy,
      exit_code: healthy ? EXIT_CODE.OK : EXIT_CODE.HEALTH_FAILED,
      reasons,
    },
  };
}
