from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


_CODEX_HOOK = """#!/usr/bin/env python3
from pathlib import Path

from praxis.runtime.adapters.codex.hooks import main


REPO_ROOT = Path(__file__).resolve().parents[2]


if __name__ == "__main__":
    raise SystemExit(main(["session-start", "--repo-root", str(REPO_ROOT)]))
"""

_CLAUDE_HOOK = """#!/usr/bin/env python3
from pathlib import Path

from praxis.runtime.adapters.claude.hooks import main


REPO_ROOT = Path(__file__).resolve().parents[2]


if __name__ == "__main__":
    raise SystemExit(main(["session-start", "--repo-root", str(REPO_ROOT)]))
"""

_CODEX_AGENT = """name = "praxis_story_worker"
description = "Fresh-context Praxis worker for one story stage using only the current dispatch and optional boundary handoff."

developer_instructions = \"\"\"
Follow the shared Praxis semantics in workflow/.

- Work only on the current Praxis dispatch.
- Treat the active boundary handoff as the only cross-story carry-forward context.
- Keep orchestration and routing decisions in the main session.
- Prefer committed workflow contracts and stage artifacts over transcript history.
\"\"\"
"""

_CLAUDE_AGENT = """---
name: praxis-story-worker
description: Fresh-context Praxis story worker for one current stage using only the active dispatch and optional boundary handoff.
---

Follow the shared Praxis semantics in `workflow/`.

- Work only on the current Praxis dispatch.
- Treat the active boundary handoff as the only cross-story carry-forward context.
- Keep orchestration and routing decisions in the main session.
- Prefer committed workflow contracts and stage artifacts over transcript history.
"""


def _dump_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2) + "\n"


def _adapter_targets(selection: str) -> list[str]:
    if selection == "all":
        return ["codex", "claude"]
    return [selection]


def _shared_instructions(adapter: str) -> str:
    return (
        f"# {adapter.capitalize()} Instructions\n\n"
        "- Keep authoritative Praxis runtime behavior in the native adapter surfaces.\n"
        "- Treat `.praxis/` as durable workflow state.\n"
    )


def _codex_files() -> dict[str, str]:
    return {
        "AGENTS.md": _shared_instructions("codex"),
        ".codex/adapter.json": _dump_json(
            {
                "version": 1,
                "adapter": "codex",
                "instructions_path": "AGENTS.md",
                "project_config_path": ".codex/config.toml",
                "hooks_path": ".codex/hooks.json",
                "agents_path": ".codex/agents",
                "worker_launch_command": "python3 -m praxis.runtime.workers.launcher --repo-root .",
                "extension_points": {
                    "mcp_config_path": ".codex/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".codex/extensions.md",
                },
            }
        ),
        ".codex/config.toml": "[features]\ncodex_hooks = true\n\n[agents]\nmax_threads = 4\nmax_depth = 1\n",
        ".codex/hooks.json": _dump_json(
            {
                "hooks": {
                    "SessionStart": [
                        {
                            "matcher": "startup|resume",
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/session_start.py\"",
                                    "statusMessage": "Loading Praxis dispatch",
                                }
                            ],
                        }
                    ]
                }
            }
        ),
        ".codex/hooks/session_start.py": _CODEX_HOOK,
        ".codex/agents/praxis_story_worker.toml": _CODEX_AGENT,
        ".codex/extensions.md": (
            "# Codex Extensions\n\n"
            "Repo-scoped Codex runtime notes and extension pointers live here.\n\n"
            "- Keep authoritative Codex runtime behavior in `AGENTS.md` and `.codex/`.\n"
            "- Treat `.codex-plugin/` as a migration mirror only.\n"
        ),
    }


def _claude_files() -> dict[str, str]:
    return {
        "CLAUDE.md": _shared_instructions("claude"),
        ".claude/adapter.json": _dump_json(
            {
                "version": 1,
                "adapter": "claude",
                "instructions_path": "CLAUDE.md",
                "project_config_path": ".claude/settings.json",
                "hooks_path": ".claude/hooks",
                "agents_path": ".claude/agents",
                "worker_launch_command": "python3 -m praxis.runtime.workers.launcher --repo-root .",
                "extension_points": {
                    "mcp_config_path": ".claude/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".claude/extensions.md",
                },
            }
        ),
        ".claude/settings.json": _dump_json(
            {
                "hooks": {
                    "SessionStart": [
                        {
                            "matcher": "startup|resume|clear|compact",
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/session_start.py\"",
                                }
                            ],
                        }
                    ]
                }
            }
        ),
        ".claude/hooks/session_start.py": _CLAUDE_HOOK,
        ".claude/agents/praxis-story-worker.md": _CLAUDE_AGENT,
        ".claude/extensions.md": (
            "# Claude Extensions\n\n"
            "Repo-scoped Claude runtime notes and extension pointers live here.\n\n"
            "- Keep authoritative Claude runtime behavior in `CLAUDE.md` and `.claude/`.\n"
            "- Treat `.claude-plugin/` as a migration mirror only.\n"
        ),
    }


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del timestamp
    created: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    targets = _adapter_targets(args.adapter)

    rendered: dict[str, str] = {}
    for adapter in targets:
        rendered.update(_codex_files() if adapter == "codex" else _claude_files())

    for rel_path, content in sorted(rendered.items()):
        path = repo_root / rel_path
        existed = path.exists()
        if existed and not args.force:
            skipped.append(rel_path)
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        if rel_path.endswith(".py"):
            path.chmod(0o755)
        if existed:
            updated.append(rel_path)
        else:
            created.append(rel_path)

    return {
        "adapters": targets,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "force": bool(args.force),
    }
