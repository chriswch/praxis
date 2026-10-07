import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = sorted(path.parent for path in (ROOT / "plugin" / "skills").glob("*/SKILL.md"))
SKILL_RELATIVE_PATH = re.compile(r"(?<![\w./~-])(?:scripts|assets|standards|references)/[\w./-]*[\w-]")
YAML_INDICATORS = tuple("[]{}#&*!|>%@`")


def skill_text(skill):
    return (skill / "SKILL.md").read_text(encoding="utf-8")


def frontmatter(skill):
    text = skill_text(skill)
    if not text.startswith("---\n") or "\n---\n" not in text[3:]:
        raise AssertionError(f"{skill.name}/SKILL.md must open with a --- frontmatter block")
    fields = {}
    key = None
    for line in text[4:text.index("\n---\n", 3)].splitlines():
        if line.startswith((" ", "\t")) and key:
            fields[key] += " " + line.strip()
        else:
            key, _, value = line.partition(":")
            fields[key] = value.strip()
    return fields


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class SkillTest(unittest.TestCase):
    def test_plugin_ships_the_craft_skill(self):
        self.assertIn("craft", [skill.name for skill in SKILLS])

    def test_frontmatter_has_only_name_and_description(self):
        for skill in SKILLS:
            with self.subTest(skill=skill.name):
                self.assertEqual(sorted(frontmatter(skill)), ["description", "name"])

    def test_name_matches_the_folder(self):
        for skill in SKILLS:
            with self.subTest(skill=skill.name):
                name = frontmatter(skill)["name"]
                self.assertEqual(name, skill.name)
                self.assertRegex(name, r"^[a-z0-9]+(-[a-z0-9]+)*$")
                self.assertLessEqual(len(name), 64)

    def test_description_has_at_most_1024_characters(self):
        for skill in SKILLS:
            with self.subTest(skill=skill.name):
                description = frontmatter(skill)["description"]
                self.assertTrue(description)
                self.assertLessEqual(len(description), 1024)

    def test_unquoted_frontmatter_values_are_valid_yaml_plain_scalars(self):
        for skill in SKILLS:
            for key, value in frontmatter(skill).items():
                with self.subTest(skill=skill.name, key=key):
                    if value[:1] in ("'", '"'):
                        self.assertEqual(value[-1:], value[:1])
                    else:
                        self.assertNotIn(": ", value)
                        self.assertNotIn(" #", value)
                        self.assertFalse(value.startswith(YAML_INDICATORS))

    def test_skill_md_stays_under_500_lines_and_5k_tokens(self):
        for skill in SKILLS:
            with self.subTest(skill=skill.name):
                text = skill_text(skill)
                self.assertLess(len(text.splitlines()), 500)
                self.assertLess(len(text) / 3, 5000)

    def test_skill_md_has_no_text_that_only_expands_on_invocation(self):
        for skill in SKILLS:
            text = skill_text(skill)
            for marker in ("${", "$ARGUMENTS", "!`"):
                with self.subTest(skill=skill.name, marker=marker):
                    self.assertNotIn(marker, text)

    def test_relative_paths_in_skill_md_exist(self):
        for skill in SKILLS:
            for path in SKILL_RELATIVE_PATH.findall(skill_text(skill)):
                with self.subTest(skill=skill.name, path=path):
                    self.assertTrue((skill / path).exists())

    def test_every_standards_and_references_file_is_named_in_skill_md(self):
        for skill in SKILLS:
            text = skill_text(skill)
            for folder in ("standards", "references"):
                for path in sorted((skill / folder).rglob("*")):
                    if path.is_file():
                        relative = path.relative_to(skill).as_posix()
                        with self.subTest(skill=skill.name, path=relative):
                            self.assertIn(relative, text)


class ManifestTest(unittest.TestCase):
    def test_manifests_and_marketplaces_name_the_same_plugin(self):
        names = {
            load("plugin/.claude-plugin/plugin.json")["name"],
            load("plugin/.codex-plugin/plugin.json")["name"],
            *(entry["name"] for entry in load(".claude-plugin/marketplace.json")["plugins"]),
            *(entry["name"] for entry in load(".agents/plugins/marketplace.json")["plugins"]),
        }
        self.assertEqual(names, {"praxis"})

    def test_claude_manifest_has_no_version(self):
        self.assertNotIn("version", load("plugin/.claude-plugin/plugin.json"))


if __name__ == "__main__":
    unittest.main()
