import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class DocumentationReferenceContractTest(unittest.TestCase):
    def test_runtime_reference_exists_and_is_referenced(self) -> None:
        runtime_ref = ROOT / "workflow/reference/runtime-reference.md"
        self.assertTrue(runtime_ref.exists())
        self.assertIn("workflow/reference/runtime-reference.md", (ROOT / "README.md").read_text())
        self.assertIn("workflow/reference/runtime-reference.md", (ROOT / "CLAUDE.md").read_text())

    def test_wrapper_reference_files_exist(self) -> None:
        self.assertTrue((ROOT / "workflow/reference/claude-wrapper.md").exists())
        self.assertTrue((ROOT / "workflow/reference/codex-wrapper.md").exists())

    def test_command_wrappers_point_at_shared_claude_reference(self) -> None:
        for rel in ["commands/craft.md", "commands/forge.md"]:
            self.assertIn("workflow/reference/claude-wrapper.md", (ROOT / rel).read_text())

    def test_skill_wrappers_point_at_shared_codex_reference(self) -> None:
        for rel in ["skills/craft/SKILL.md", "skills/forge/SKILL.md"]:
            self.assertIn("workflow/reference/codex-wrapper.md", (ROOT / rel).read_text())

    def test_docs_reference_native_claude_repo_surfaces(self) -> None:
        self.assertIn("CLAUDE.md", (ROOT / "README.md").read_text())
        runtime_ref = (ROOT / "workflow/reference/runtime-reference.md").read_text()
        self.assertIn("CLAUDE.md", runtime_ref)
        self.assertIn(".claude/settings.json", runtime_ref)
        self.assertIn(".claude/hooks/", runtime_ref)
        self.assertIn(".claude/agents/", runtime_ref)

    def test_docs_reference_native_codex_repo_surfaces(self) -> None:
        self.assertIn("AGENTS.md", (ROOT / "README.md").read_text())
        runtime_ref = (ROOT / "workflow/reference/runtime-reference.md").read_text()
        self.assertIn("AGENTS.md", runtime_ref)
        self.assertIn(".codex/config.toml", runtime_ref)
        self.assertIn(".codex/hooks.json", runtime_ref)
        self.assertIn(".codex/agents/", runtime_ref)


if __name__ == "__main__":
    unittest.main()
