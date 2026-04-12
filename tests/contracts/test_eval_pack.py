import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.observability.eval_pack import run_eval_pack


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = PROJECT_ROOT / "tests" / "evals" / "fixtures"


class EvalPackContractTest(unittest.TestCase):
    def test_eval_pack_passes_all_fixtures(self) -> None:
        result = run_eval_pack(fixtures_dir=FIXTURES_DIR)

        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["passed"], result["total"])
        self.assertGreaterEqual(result["total"], 8)

    def test_eval_pack_cli_reports_summary(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.observability.eval_pack",
                "run",
                "--fixtures-dir",
                str(FIXTURES_DIR),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["passed"], result["total"])

    def test_native_gate_cli_passes_repo_native_fixtures(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.observability.eval_pack",
                "native-gate",
                "--fixtures-dir",
                str(FIXTURES_DIR),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["passed"], result["total"])
        self.assertEqual(
            result["selected_kinds"],
            ["adapter_parity", "native_harness", "native_trace"],
        )

    def test_native_gate_cli_fails_closed_without_native_cases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures_dir = Path(tmp)
            shutil.copy(
                FIXTURES_DIR / "routing_forge_sketch_ready.json",
                fixtures_dir / "routing_forge_sketch_ready.json",
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "praxis.runtime.observability.eval_pack",
                    "native-gate",
                    "--fixtures-dir",
                    str(fixtures_dir),
                ],
                cwd=PROJECT_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertEqual(completed.returncode, 1)
        result = json.loads(completed.stdout)
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["failed"], 3)
        self.assertEqual(
            [case["name"] for case in result["cases"]],
            [
                "missing_required_kind:adapter_parity",
                "missing_required_kind:native_harness",
                "missing_required_kind:native_trace",
            ],
        )


if __name__ == "__main__":
    unittest.main()
