import json
import subprocess
import sys
import unittest
from pathlib import Path

from workflow.scripts.eval_pack import run_eval_pack


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = PROJECT_ROOT / "tests" / "evals" / "fixtures"


class EvalPackContractTest(unittest.TestCase):
    def test_eval_pack_passes_all_fixtures(self) -> None:
        result = run_eval_pack(fixtures_dir=FIXTURES_DIR)

        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["passed"], result["total"])
        self.assertGreaterEqual(result["total"], 5)

    def test_eval_pack_cli_reports_summary(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "workflow.scripts.eval_pack",
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


if __name__ == "__main__":
    unittest.main()
