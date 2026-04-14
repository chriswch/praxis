import json
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.context.bundle import bundle_paths_for_run, load_dispatch_bundle_status
from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.workers.bookkeeping import build_worker_ownership, dispatch_bundle_paths, worker_record_relpath
from praxis.runtime.workers.planning import build_worker_isolation, ensure_run_vnext_defaults


def load_json(path: Path):
    return json.loads(path.read_text())


class SidecarBookkeepingContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_json(self, rel_path: str, payload: dict) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")

    def test_subagent_ownership_marks_the_worker_as_a_non_owner(self) -> None:
        ownership = build_worker_ownership(
            worker_id="wrk_sidecar_01",
            worker_class="subagent_worker",
            spawned_by_worker_id="wrk_S009_impl_57",
        )

        self.assertEqual(ownership["kind"], "sidecar")
        self.assertFalse(ownership["run_routing_owned"])
        self.assertFalse(ownership["stage_result_expected"])
        self.assertEqual(ownership["artifact_namespace"], "sidecar")
        self.assertEqual(ownership["spawned_by_worker_id"], "wrk_S009_impl_57")
        self.assertEqual(ownership["reason_code"], "sidecar_non_owner")

    def test_sidecar_artifacts_use_dedicated_runtime_namespaces(self) -> None:
        run = {
            "version": 4,
            "workflow": "forge",
            "status": "running",
            "entry_task": "Bookkeep a sidecar worker",
            "mode": "multi_slice",
            "runtime": {"adapter": "codex", "entrypoint": "praxis:forge"},
            "execution": {"mode": "autopilot", "fresh_context_per_story": True},
            "current": {
                "scope": "slice",
                "slice_id": "S-009",
                "artifact_dir": ".praxis/slices/S-009",
                "stage": "rapid-implementing",
                "worker_id": "wrk_S009_impl_57",
            },
            "routing": {
                "next_action": "run_stage",
                "next_stage": "rapid-implementing",
                "next_slice_id": None,
                "reason": "Implementation is active.",
                "stop_reason_code": None,
                "boundary_handoff_path": None,
                "pending_worker_action": "await_stage_result",
                "resume_strategy": "prefer_resume_then_relaunch",
            },
            "control": {"last_transition_id": "tx_057"},
            "timestamps": {
                "created_at": "2026-04-14T00:00:00Z",
                "updated_at": "2026-04-14T00:00:00Z",
            },
        }
        ensure_run_vnext_defaults(run)
        dispatch = {
            "scope": "slice",
            "slice_id": "S-009",
            "artifact_dir": ".praxis/slices/S-009",
            "stage": "rapid-implementing",
        }

        bundle = bundle_paths_for_run(
            run,
            dispatch,
            worker_id="wrk_sidecar_01",
            worker_class="subagent_worker",
        )

        self.assertIn("/dispatches/sidecars/", bundle["bundle_dir"])
        self.assertTrue(
            worker_record_relpath("wrk_sidecar_01", worker_class="subagent_worker").startswith(
                ".praxis/runtime/workers/sidecars/"
            )
        )

    def test_sidecar_contracts_validate_and_status_surfaces_ownership(self) -> None:
        dispatch_id = "tx-057-wrk-sidecar-01-rapid-implementing"
        bundle = dispatch_bundle_paths(dispatch_id=dispatch_id, worker_class="subagent_worker")
        ownership = build_worker_ownership(
            worker_id="wrk_sidecar_01",
            worker_class="subagent_worker",
            spawned_by_worker_id="wrk_S009_impl_57",
        )
        dispatch = {
            "action": "run_stage",
            "workflow": "forge",
            "adapter": "codex",
            "entrypoint": "praxis:forge",
            "scope": "slice",
            "slice_id": "S-009",
            "artifact_dir": ".praxis/slices/S-009",
            "stage": "rapid-implementing",
            "boundary_handoff_path": None,
            "stage_result_path": ".praxis/slices/S-009/results/rapid-implementing.json",
        }
        allowed_sources = [
            "dispatch",
            "run_metadata",
            "artifact_input",
            "harness_surface",
        ]
        payload = {
            "version": 3,
            "workflow": "forge",
            "adapter": "codex",
            "dispatch": dispatch,
            "inputs": {
                "run_path": ".praxis/run.json",
                "boundary_handoff_path": None,
                "boundary_handoff": None,
            },
            "context_policy": {
                "fresh_context": True,
                "carry_forward_mode": "boundary_handoff_only",
                "allowed_context_sources": allowed_sources,
                "handoff_injected": False,
            },
            "harness": {
                "config_path": ".codex/adapter.json",
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
                "compatibility": None,
            },
            "bundle": bundle,
            "worker": {
                "worker_id": "wrk_sidecar_01",
                "worker_class": "subagent_worker",
                "reuse_policy": "none",
                "review_independence": False,
                "worktree_mode": "shared",
                "fresh_context": True,
                "reason": "Launch an explicit sidecar worker for bounded parallel bookkeeping.",
                "worktree_path": ".",
            },
            "ownership": ownership,
            "permissions": {
                "profile": "implementation",
                "filesystem_scope": "workspace-write",
                "network_access": "restricted",
                "destructive_commands_allowed": False,
                "enforcement_mode": "advisory",
                "control_plane_access": "projected_read_only",
                "writable_roots": [".praxis/slices/S-009", "."],
                "blocked_paths": [
                    ".praxis/run.json",
                    ".praxis/story-ledger.json",
                    ".praxis/runtime/",
                ],
            },
            "budgets": {
                "run_max_turns": 400,
                "run_max_workers": 40,
                "soft_cost_usd": 25.0,
                "hard_cost_usd": 40.0,
                "worker_timeout_minutes": 45,
            },
            "artifact_inputs": [".praxis/run.json"],
            "artifact_outputs_expected": [".praxis/slices/S-009/results/rapid-implementing.json"],
            "resume": {
                "strategy": None,
                "session_id": None,
                "resumable": False,
                "resume_attempted": False,
                "mode": "headless",
                "trace_path": ".praxis/runtime/traces/wrk_sidecar_01.jsonl",
            },
        }
        validate_contract_payload("worker-launch.schema.json", payload)

        context_manifest = {
            "version": 1,
            "dispatch_id": dispatch_id,
            "run_id": "run_20260414000000",
            "generated_at": "2026-04-14T00:00:00Z",
            "dispatch": {
                "workflow": "forge",
                "adapter": "codex",
                "scope": "slice",
                "slice_id": "S-009",
                "artifact_dir": ".praxis/slices/S-009",
                "stage": "rapid-implementing",
                "boundary_handoff_path": None,
                "transition_id": "tx_057",
            },
            "worker": {
                "worker_id": "wrk_sidecar_01",
                "worker_class": "subagent_worker",
                "permission_profile": "implementation",
                "worktree_mode": "shared",
                "fresh_context": True,
            },
            "runtime_policy": {
                "profile": "implementation",
                "filesystem_scope": "workspace-write",
                "network_access": "restricted",
                "destructive_commands_allowed": False,
                "enforcement_mode": "advisory",
                "control_plane_access": "projected_read_only",
                "writable_roots": [".praxis/slices/S-009", "."],
                "blocked_paths": [
                    ".praxis/run.json",
                    ".praxis/story-ledger.json",
                    ".praxis/runtime/",
                ],
            },
            "context_policy": {
                "carry_forward_mode": "boundary_handoff_only",
                "handoff_injected": False,
                "allowed_context_sources": allowed_sources,
                "selected_item_count": 4,
                "max_item_count": 16,
            },
            "bundle": {
                "bundle_dir": bundle["bundle_dir"],
                "worker_launch_path": bundle["worker_launch_path"],
                "dispatch_record_path": bundle["dispatch_record_path"],
                "context_manifest_path": bundle["context_manifest_path"],
                "tool_manifest_path": bundle["tool_manifest_path"],
            },
            "selection_summary": {
                "total_items": 4,
                "max_items": 16,
                "within_budget": True,
                "default_item_count": 3,
                "stage_specific_item_count": 1,
                "carry_forward_item_count": 0,
            },
            "items": [
                {
                    "kind": "dispatch",
                    "path": None,
                    "inline_id": "dispatch",
                    "required": True,
                    "selection_phase": "default",
                    "reason_code": "dispatch_assignment",
                    "reason": "Dispatch metadata defines the bounded sidecar assignment.",
                },
                {
                    "kind": "run_metadata",
                    "path": ".praxis/run.json",
                    "inline_id": "run_metadata",
                    "required": True,
                    "selection_phase": "default",
                    "reason_code": "run_cursor_required",
                    "reason": "Durable run metadata keeps the sidecar aligned with the active story.",
                },
                {
                    "kind": "artifact_input",
                    "path": ".praxis/run.json",
                    "inline_id": None,
                    "required": True,
                    "selection_phase": "stage_specific",
                    "reason_code": "stage_artifact_input",
                    "reason": "The sidecar keeps its bounded launch input explicit.",
                },
                {
                    "kind": "harness_surface",
                    "path": "AGENTS.md",
                    "inline_id": "instructions_path",
                    "required": True,
                    "selection_phase": "default",
                    "reason_code": "harness_instructions",
                    "reason": "Repo-scoped native instructions stay explicit for the sidecar launch.",
                },
            ],
        }
        validate_contract_payload("context-manifest.schema.json", context_manifest)

        dispatch_record = {
            "version": 1,
            "dispatch_id": dispatch_id,
            "run_id": "run_20260414000000",
            "recorded_at": "2026-04-14T00:00:00Z",
            "status": "intent_recorded",
            "dispatch": {
                "workflow": "forge",
                "adapter": "codex",
                "entrypoint": "praxis:forge",
                "scope": "slice",
                "slice_id": "S-009",
                "artifact_dir": ".praxis/slices/S-009",
                "stage": "rapid-implementing",
                "boundary_handoff_path": None,
                "transition_id": "tx_057",
                "reason": payload["worker"]["reason"],
            },
            "worker": {
                "worker_id": "wrk_sidecar_01",
                "worker_class": "subagent_worker",
                "reuse_policy": "none",
                "permission_profile": "implementation",
                "worktree_mode": "shared",
                "fresh_context": True,
            },
            "resume": {
                "strategy": None,
                "session_id": None,
                "resumable": False,
                "mode": "headless",
            },
            "bundle": {
                "bundle_dir": bundle["bundle_dir"],
                "worker_launch_path": bundle["worker_launch_path"],
                "dispatch_record_path": bundle["dispatch_record_path"],
                "context_manifest_path": bundle["context_manifest_path"],
                "tool_manifest_path": bundle["tool_manifest_path"],
            },
            "isolation": build_worker_isolation(
                worker_id="wrk_sidecar_01",
                stage="rapid-implementing",
                review_independence=False,
                worktree_mode="shared",
                worktree_path=".",
            ),
            "ownership": ownership,
            "artifact_inputs": [".praxis/run.json"],
            "artifact_outputs_expected": [".praxis/slices/S-009/results/rapid-implementing.json"],
            "resolution": {
                "status": "intent_recorded",
                "updated_at": "2026-04-14T00:00:00Z",
                "resolved": False,
                "reason_code": "intent_recorded",
                "reason": "Praxis recorded the dispatch intent before adapter launch or resume began.",
                "native_launch_record_path": None,
                "native_resume_record_path": None,
                "worker_record_path": None,
                "session_record_path": None,
            },
        }
        validate_contract_payload("dispatch-record.schema.json", dispatch_record)

        worker_record = {
            "version": 1,
            "worker_id": "wrk_sidecar_01",
            "run_id": "run_20260414000000",
            "adapter": "codex",
            "worker_class": "subagent_worker",
            "launch_surface": "codex_exec",
            "launch_reason": payload["worker"]["reason"],
            "permission_profile": "implementation",
            "worktree_mode": "shared",
            "worktree_path": ".",
            "session_id": "sess-sidecar-01",
            "launch_record_path": ".praxis/runtime/launches/codex/20260414T000000Z-wrk-sidecar-01.json",
            "dispatch_id": dispatch_id,
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "trace_path": ".praxis/runtime/traces/wrk_sidecar_01.jsonl",
            "launcher_pid": 123,
            "isolation": build_worker_isolation(
                worker_id="wrk_sidecar_01",
                stage="rapid-implementing",
                review_independence=False,
                worktree_mode="shared",
                worktree_path=".",
            ),
            "ownership": ownership,
            "status": "running",
        }
        validate_contract_payload("worker-record.schema.json", worker_record)

        native_launch = {
            "version": 4,
            "recorded_at": "2026-04-14T00:00:00Z",
            "adapter": "codex",
            "kind": "session_start",
            "session": {
                "id": "sess-sidecar-01",
                "source": "control_plane_sidecar",
                "cwd": ".",
                "resumable": False,
                "origin": "headless_start",
                "provider_locator": None,
                "resumable_reason_code": "provider_locator_missing",
                "resumable_reason": "Praxis has not captured a provider-issued resume locator for this session.",
            },
            "dispatch": {
                "workflow": "forge",
                "scope": "slice",
                "slice_id": "S-009",
                "artifact_dir": ".praxis/slices/S-009",
                "stage": "rapid-implementing",
                "boundary_handoff_path": None,
            },
            "context": {
                "fresh_context": True,
                "carry_forward_mode": "boundary_handoff_only",
                "allowed_context_sources": allowed_sources,
                "handoff_injected": False,
                "boundary_handoff_story_id": None,
                "boundary_handoff_next_story_id": None,
                "context_fingerprint": "0" * 64,
                "boundary_handoff_fingerprint": None,
            },
            "bundle": {
                "dispatch_id": dispatch_id,
                "worker_launch_path": bundle["worker_launch_path"],
                "dispatch_record_path": bundle["dispatch_record_path"],
                "context_manifest_path": bundle["context_manifest_path"],
            },
            "worker": {
                "worker_id": "wrk_sidecar_01",
                "worker_class": "subagent_worker",
                "launch_surface": "codex_exec",
                "permission_profile": "implementation",
                "worktree_mode": "shared",
                "worktree_path": ".",
                "worker_signature": "1" * 64,
                "launcher_pid": 123,
            },
            "ownership": ownership,
            "resume": {
                "attempted": False,
                "outcome": "resume_not_attempted",
                "strategy": None,
                "previous_session_id": None,
                "mode": "headless",
            },
            "harness": {
                "instructions_path": "AGENTS.md",
                "project_config_path": ".codex/config.toml",
                "hooks_path": ".codex/hooks.json",
                "agents_path": ".codex/agents",
                "launch_record_path": ".praxis/runtime/launches/codex/20260414T000000Z-wrk-sidecar-01.json",
                "trace_path": ".praxis/runtime/traces/wrk_sidecar_01.jsonl",
                "compatibility": None,
            },
        }
        validate_contract_payload("native-launch.schema.json", native_launch)

        tool_manifest = {
            "version": 1,
            "dispatch_id": dispatch_id,
            "run_id": "run_20260414000000",
            "generated_at": "2026-04-14T00:00:00Z",
            "adapter": "codex",
            "broker": {
                "command": "python3 -m praxis.runtime.tool_broker",
                "tool_records_dir": f".praxis/runtime/tools/{dispatch_id}",
            },
            "worker": {
                "worker_id": "wrk_sidecar_01",
                "worker_class": "subagent_worker",
                "permission_profile": "implementation",
            },
            "policy": {
                "filesystem_scope": "workspace-write",
                "network_access": "restricted",
                "destructive_commands_allowed": False,
                "enforcement_mode": "advisory",
                "control_plane_access": "projected_read_only",
                "writable_roots": [".praxis/slices/S-009", "."],
                "blocked_paths": [
                    ".praxis/run.json",
                    ".praxis/story-ledger.json",
                    ".praxis/runtime/",
                ],
            },
            "tool_count": 1,
            "tools": [
                {
                    "tool_id": "repo_read",
                    "description": "Read repo files and durable runtime artifacts.",
                    "permission_class": "read_only",
                    "side_effect_class": "none",
                    "latency_class": "low",
                    "provenance": "praxis_runtime",
                    "adapter_availability": ["claude", "codex"],
                    "native_surface": "native_file_read",
                    "broker_action": "repo-read",
                    "requires_declared_write_paths": False,
                    "enabled": True,
                }
            ],
        }
        validate_contract_payload("tool-manifest.schema.json", tool_manifest)

        self._write_json(bundle["worker_launch_path"], payload)
        self._write_json(bundle["context_manifest_path"], context_manifest)
        self._write_json(bundle["dispatch_record_path"], dispatch_record)
        self._write_json(bundle["tool_manifest_path"], tool_manifest)

        status = load_dispatch_bundle_status(repo_root=self.repo_root, bundle=bundle)

        assert status is not None
        self.assertTrue(status["available"])
        self.assertEqual(status["ownership_kind"], "sidecar")
        self.assertFalse(status["run_routing_owned"])
        self.assertFalse(status["stage_result_expected"])
        self.assertEqual(status["artifact_namespace"], "sidecar")
        self.assertEqual(status["spawned_by_worker_id"], "wrk_S009_impl_57")
        self.assertEqual(status["ownership_reason_code"], "sidecar_non_owner")
        self.assertEqual(status["tool_count"], 1)
        self.assertFalse(status["handoff_injected"])
        self.assertEqual(status["dispatch_status"], "intent_recorded")
        written_payload = load_json(self.repo_root / bundle["worker_launch_path"])
        self.assertEqual(written_payload["ownership"]["kind"], "sidecar")


if __name__ == "__main__":
    unittest.main()
