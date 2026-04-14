from __future__ import annotations

from typing import Any


_PROFILE_DEFAULTS: dict[str, dict[str, Any]] = {
    "planning": {
        "filesystem_scope": "workspace-write",
        "network_access": "restricted",
        "destructive_commands_allowed": False,
    },
    "design": {
        "filesystem_scope": "workspace-write",
        "network_access": "restricted",
        "destructive_commands_allowed": False,
    },
    "implementation": {
        "filesystem_scope": "workspace-write",
        "network_access": "enabled",
        "destructive_commands_allowed": False,
    },
    "review": {
        "filesystem_scope": "workspace-write",
        "network_access": "restricted",
        "destructive_commands_allowed": False,
    },
    "verification": {
        "filesystem_scope": "workspace-write",
        "network_access": "restricted",
        "destructive_commands_allowed": False,
    },
}

_PROTECTED_CONTROL_PLANE_PATHS = [
    ".praxis/run.json",
    ".praxis/story-ledger.json",
    ".praxis/runtime/",
]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _control_plane_access(*, worktree_mode: str, ownership_kind: str) -> str:
    if ownership_kind == "sidecar" or worktree_mode == "isolated":
        return "projected_read_only"
    return "direct_repo"


def _enforcement_mode(*, adapter: str, control_plane_access: str) -> str:
    if control_plane_access != "projected_read_only":
        return "advisory"
    # Codex can combine the projected control plane with an explicit sandbox mode.
    if adapter == "codex":
        return "enforced"
    return "advisory"


def build_runtime_policy(
    *,
    adapter: str,
    permission_profile: str,
    worktree_mode: str,
    worktree_path: str,
    artifact_dir: str,
    ownership_kind: str,
) -> dict[str, Any]:
    defaults = _PROFILE_DEFAULTS.get(permission_profile, _PROFILE_DEFAULTS["implementation"])
    control_plane_access = _control_plane_access(
        worktree_mode=worktree_mode,
        ownership_kind=ownership_kind,
    )
    writable_roots = _dedupe(
        [
            artifact_dir,
            worktree_path,
        ]
    )
    return {
        "profile": permission_profile,
        "filesystem_scope": defaults["filesystem_scope"],
        "network_access": defaults["network_access"],
        "destructive_commands_allowed": defaults["destructive_commands_allowed"],
        "enforcement_mode": _enforcement_mode(
            adapter=adapter,
            control_plane_access=control_plane_access,
        ),
        "control_plane_access": control_plane_access,
        "writable_roots": writable_roots,
        "blocked_paths": list(_PROTECTED_CONTROL_PLANE_PATHS),
    }


def projection_required(policy: dict[str, Any]) -> bool:
    return policy.get("control_plane_access") == "projected_read_only"


def protected_control_plane_paths() -> list[str]:
    return list(_PROTECTED_CONTROL_PLANE_PATHS)
