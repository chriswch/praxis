from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..state.contract_validation import validate_contract_payload


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_tool_manifest(*, run: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    permissions = payload["permissions"]
    adapter = payload["adapter"]
    tools = [
        {
            "tool_id": "repo_read",
            "description": "Read repo files and durable runtime artifacts.",
            "permission_class": "read_only",
            "side_effect_class": "none",
            "latency_class": "low",
            "provenance": "praxis_runtime",
            "adapter_availability": ["claude", "codex"],
            "native_surface": "native_file_read",
            "enabled": True,
        },
        {
            "tool_id": "repo_search",
            "description": "Search repo files and durable artifacts with bounded local queries.",
            "permission_class": "read_only",
            "side_effect_class": "none",
            "latency_class": "low",
            "provenance": "praxis_runtime",
            "adapter_availability": ["claude", "codex"],
            "native_surface": "native_repo_search",
            "enabled": True,
        },
        {
            "tool_id": "repo_patch",
            "description": "Edit repo files through bounded patch-style changes in the assigned worktree.",
            "permission_class": "workspace_write",
            "side_effect_class": "filesystem_write",
            "latency_class": "low",
            "provenance": "praxis_runtime",
            "adapter_availability": ["claude", "codex"],
            "native_surface": "native_repo_edit",
            "enabled": permissions["filesystem_scope"] != "read-only",
        },
        {
            "tool_id": "repo_shell",
            "description": "Run bounded shell commands inside the assigned worktree.",
            "permission_class": "workspace_write",
            "side_effect_class": "filesystem_write",
            "latency_class": "medium",
            "provenance": "praxis_runtime",
            "adapter_availability": ["claude", "codex"],
            "native_surface": "native_shell",
            "enabled": permissions["filesystem_scope"] != "read-only",
        },
    ]
    if permissions["network_access"] != "restricted":
        tools.append(
            {
                "tool_id": "network_fetch",
                "description": "Fetch network resources when the active worker profile allows it.",
                "permission_class": "network_access",
                "side_effect_class": "network",
                "latency_class": "high",
                "provenance": "praxis_runtime",
                "adapter_availability": ["claude", "codex"],
                "native_surface": "native_network_fetch",
                "enabled": True,
            }
        )

    manifest = {
        "version": 1,
        "dispatch_id": payload["bundle"]["dispatch_id"],
        "run_id": run["run_id"],
        "generated_at": _utc_now(),
        "adapter": adapter,
        "worker": {
            "worker_id": payload["worker"]["worker_id"],
            "worker_class": payload["worker"]["worker_class"],
            "permission_profile": payload["permissions"]["profile"],
        },
        "policy": {
            "filesystem_scope": permissions["filesystem_scope"],
            "network_access": permissions["network_access"],
            "destructive_commands_allowed": permissions["destructive_commands_allowed"],
        },
        "tool_count": len(tools),
        "tools": tools,
    }
    validate_contract_payload("tool-manifest.schema.json", manifest)
    return manifest
