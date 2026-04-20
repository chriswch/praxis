import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoInstructionSurface } from "../../contracts/model.js";

// CLI-owned worker-instruction surfaces. Plugin-side surfaces
// (`.claude-plugin/`, `.codex-plugin/`) are the host adapter's concern and are
// intentionally absent here — the CLI does not enumerate plugin files.
const SURFACE_BLUEPRINTS: Omit<RepoInstructionSurface, "exists">[] = [
  {
    path: "cli/AGENTS.md",
    kind: "file",
    provider: "shared",
    authoritative: true,
    description: "CLI-level shared worker instructions.",
  },
  {
    path: "cli/CLAUDE.md",
    kind: "file",
    provider: "claude",
    authoritative: true,
    description: "CLI-level Claude worker instructions.",
  },
];

export function buildInstructionSurfaceManifest(repoRoot: string): RepoInstructionSurface[] {
  return SURFACE_BLUEPRINTS.map((surface) => ({
    ...surface,
    exists: existsSync(join(repoRoot, surface.path)),
  }));
}

export function selectInstructionSurfaces(
  surfaces: RepoInstructionSurface[],
  provider: "codex" | "claude",
): RepoInstructionSurface[] {
  return surfaces.filter(
    (surface) => surface.exists && (surface.provider === "shared" || surface.provider === provider),
  );
}
