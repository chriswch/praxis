import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoInstructionSurface } from "../../contracts/model.js";

const SURFACE_BLUEPRINTS: Array<Omit<RepoInstructionSurface, "exists">> = [
  {
    path: "AGENTS.md",
    kind: "file",
    provider: "shared",
    authoritative: true,
    description: "Repo-level shared worker instructions.",
  },
  {
    path: ".codex/config.toml",
    kind: "file",
    provider: "codex",
    authoritative: true,
    description: "Authoritative Codex runtime configuration.",
  },
  {
    path: ".codex/hooks.json",
    kind: "file",
    provider: "codex",
    authoritative: true,
    description: "Authoritative Codex hook configuration.",
  },
  {
    path: ".codex/agents",
    kind: "directory",
    provider: "codex",
    authoritative: true,
    description: "Authoritative Codex agent surfaces.",
  },
  {
    path: "CLAUDE.md",
    kind: "file",
    provider: "claude",
    authoritative: true,
    description: "Repo-level Claude instructions.",
  },
  {
    path: ".claude",
    kind: "directory",
    provider: "claude",
    authoritative: true,
    description: "Claude repo runtime surfaces.",
  },
  {
    path: ".codex-plugin",
    kind: "directory",
    provider: "codex",
    authoritative: false,
    description: "Compatibility mirror for Codex migration, not the source of truth.",
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
