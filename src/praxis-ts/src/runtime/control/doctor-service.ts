import { exists } from "../state/store.js";
import { getAllAdapters } from "../adapters/index.js";
import { resolvePraxisPaths } from "../state/paths.js";

export type DoctorReport = {
  repo_root: string;
  runtime: {
    node: string;
    platform: string;
    praxis_dir_exists: boolean;
  };
  adapters: Array<{
    adapter: string;
    healthy: boolean;
    supports_resume: boolean;
    reason: string;
  }>;
  recoverability: {
    has_run_manifest: boolean;
    has_event_log: boolean;
    has_dispatch_directory: boolean;
    integrity: "healthy" | "warning";
  };
};

export async function buildDoctorReport(repoRoot: string): Promise<DoctorReport> {
  const paths = resolvePraxisPaths(repoRoot);

  const adapters = await Promise.all(
    getAllAdapters().map(async (adapter) => {
      const health = await adapter.health();
      return {
        adapter: health.adapter,
        healthy: health.healthy,
        supports_resume: health.supports_resume,
        reason: health.reason
      };
    })
  );

  const [praxisDirExists, hasRunManifest, hasEventLog, hasDispatchDirectory] = await Promise.all([
    exists(paths.praxisDir),
    exists(paths.runFile),
    exists(paths.eventsFile),
    exists(paths.dispatchesDir)
  ]);

  const integrity = hasRunManifest || !praxisDirExists ? "healthy" : "warning";

  return {
    repo_root: repoRoot,
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      praxis_dir_exists: praxisDirExists
    },
    adapters,
    recoverability: {
      has_run_manifest: hasRunManifest,
      has_event_log: hasEventLog,
      has_dispatch_directory: hasDispatchDirectory,
      integrity
    }
  };
}
