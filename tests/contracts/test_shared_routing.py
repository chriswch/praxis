import unittest

from workflow.scripts.routing import resolve_next_stage_for_result


class SharedRoutingContractTest(unittest.TestCase):
    def test_resolves_workflow_specific_next_stage_in_shared_routing(self) -> None:
        sketch_result = {
            "stage": "sketching-design",
            "route": {
                "kind": "proceed",
                "next_stage": None,
                "next_slice_id": None,
            },
            "data": {
                "outcome_code": "sketch_ready",
            },
        }

        self.assertEqual(
            resolve_next_stage_for_result(workflow="craft", stage_result=sketch_result),
            "driving-tdd",
        )
        self.assertEqual(
            resolve_next_stage_for_result(workflow="forge", stage_result=sketch_result),
            "rapid-implementing",
        )

    def test_rejects_stage_result_next_stage_drift(self) -> None:
        review_result = {
            "stage": "code-reviewing",
            "route": {
                "kind": "proceed",
                "next_stage": "code-improving",
                "next_slice_id": None,
            },
            "data": {
                "outcome_code": "review_skipped",
            },
        }

        with self.assertRaisesRegex(ValueError, "next_stage drifted"):
            resolve_next_stage_for_result(workflow="craft", stage_result=review_result)


if __name__ == "__main__":
    unittest.main()
