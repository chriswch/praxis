import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WF = ROOT / "plugin" / "skills" / "praxis" / "scripts" / "wf.py"
TEST_CMD = 'echo {files} >> "$TEST_LOG"; for f in {files}; do sh "$f" || exit 1; done'


def run(args, cwd, env, check=True):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise AssertionError(f"{args} exited {result.returncode}\n{result.stdout}\n{result.stderr}")
    return result


class Project:
    def __init__(self, tmp):
        self.tmp = tmp
        self.home = tmp / "home"
        self.home.mkdir()
        gitconfig = tmp / "gitconfig"
        gitconfig.write_text("")
        self.log = tmp / "tests.log"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "GIT_CONFIG_GLOBAL": str(gitconfig),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "Test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
            "TEST_LOG": str(self.log),
        }
        self.origin = tmp / "origin.git"
        self.main = tmp / "main"
        self.feature_dir = self.main / ".praxis" / "feat"
        self.worktree = self.feature_dir / "worktree"
        self.git(tmp, "init", "-q", "--bare", "-b", "main", str(self.origin))
        self.git(tmp, "clone", "-q", str(self.origin), str(self.main))
        self.write("src/app.txt", "v1\n")
        self.write("tests/app_test.sh", "exit 0\n")
        self.git(self.main, "add", "-A")
        self.git(self.main, "commit", "-q", "-m", "Initial commit")
        self.git(self.main, "push", "-q", "origin", "main")
        self.config()

    def git(self, cwd, *args):
        return run(["git", *args], cwd, self.env).stdout.strip()

    def write(self, relative, text, root=None):
        path = (root or self.main) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def config(self, **fields):
        self.write(".praxis/config.json", json.dumps({"test_cmd": TEST_CMD, "test_glob": "tests/*_test.sh", **fields}))

    def wf(self, *args, cwd=None, check=True):
        return run([sys.executable, str(WF), *args], cwd or self.worktree, self.env, check)

    def state(self):
        return json.loads((self.feature_dir / "state.json").read_text())

    def plan(self, questions="", stories="### Pay by card\n"):
        text = f"## Requirements\n\n## Questions\n{questions}\n## Stories\n{stories}\n## Design\n\n## Findings\n"
        (self.feature_dir / "plan.md").write_text(text)

    def to_build(self, stories="### Pay by card\n"):
        self.wf("start", "feat", cwd=self.main)
        self.plan(stories=stories)
        self.wf("next")
        self.wf("next")

    def pr_file(self, name, title):
        return self.write(f"prs/{name}.md", f"# {title}\n\nWhy and what.\n", root=self.feature_dir)

    def commit_pr(self, name, title, test=None, test_body="exit 0\n", extra=()):
        if test:
            self.write(f"tests/{test}_test.sh", test_body, root=self.worktree)
        self.write("src/app.txt", f"{name}\n", root=self.worktree)
        return self.wf("pr-done", str(self.pr_file(name, title)), *extra)

    def finish_story(self):
        self.wf("next")
        self.wf("review")
        return self.wf("next")

    def head(self):
        return self.git(self.worktree, "rev-parse", "HEAD")

    def ran(self):
        return self.log.read_text().splitlines() if self.log.exists() else []


class WfTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()).resolve()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.p = Project(self.tmp)


class StartTest(WfTestCase):
    def test_start_branches_a_worktree_from_the_remote_default_branch(self):
        other = self.tmp / "other"
        self.p.git(self.tmp, "clone", "-q", str(self.p.origin), str(other))
        self.p.write("src/app.txt", "v2\n", root=other)
        self.p.git(other, "commit", "-q", "-am", "Remote change")
        self.p.git(other, "push", "-q", "origin", "main")

        out = self.p.wf("start", "feat", cwd=self.p.main).stdout

        self.assertIn(f"worktree: {self.p.worktree}", out)
        self.assertEqual(self.p.head(), self.p.git(other, "rev-parse", "HEAD"))
        self.assertEqual(self.p.git(self.p.worktree, "branch", "--show-current"), "feat")
        self.assertIn(".praxis/", (self.p.main / ".git" / "info" / "exclude").read_text().split())
        self.assertEqual(self.p.git(self.p.main, "status", "--porcelain"), "")

    def test_start_defaults_to_auto_mode(self):
        self.p.wf("start", "feat", cwd=self.p.main)

        self.assertIn("mode: auto", self.p.wf("status").stdout)

    def test_start_refuses_a_missing_config_and_names_the_file(self):
        (self.p.main / ".praxis" / "config.json").unlink()

        result = self.p.wf("start", "feat", cwd=self.p.main, check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn(str(self.p.main / ".praxis" / "config.json"), result.stderr)
        self.assertFalse(self.p.worktree.exists())

    def test_start_refuses_a_test_command_without_files(self):
        self.p.config(test_cmd="make test")

        result = self.p.wf("start", "feat", cwd=self.p.main, check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("{files}", result.stderr)
        self.assertIn(str(self.p.main / ".praxis" / "config.json"), result.stderr)

    def test_setup_runs_in_the_worktree_with_wf_main(self):
        self.p.config(setup='pwd > "$TEST_LOG"; printf "%s\\n" "$WF_MAIN" >> "$TEST_LOG"')

        self.p.wf("start", "feat", cwd=self.p.main)

        self.assertEqual(self.p.ran(), [str(self.p.worktree), str(self.p.main)])

    def test_failed_setup_exits_1_and_names_the_command(self):
        self.p.config(setup="exit 3")

        result = self.p.wf("start", "feat", cwd=self.p.main, check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("exit 3", result.stderr)

    def test_start_refuses_setup_that_leaves_files_git_would_commit(self):
        self.p.config(setup="ln -s /tmp linked")

        result = self.p.wf("start", "feat", cwd=self.p.main, check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("linked", result.stderr)

    def test_start_on_an_existing_feature_only_reruns_setup(self):
        self.p.config(setup='echo setup >> "$TEST_LOG"')
        self.p.wf("start", "feat", cwd=self.p.main)
        marker = self.p.write("marker.txt", "kept\n", root=self.p.worktree)
        self.p.wf("mode", "step")

        self.p.wf("start", "feat", "--mode", "auto", cwd=self.p.main)

        self.assertTrue(marker.exists())
        self.assertEqual(self.p.ran(), ["setup", "setup"])
        self.assertIn("mode: step", self.p.wf("status").stdout)


class PlanAndDesignTest(WfTestCase):
    def test_next_refuses_while_questions_remain(self):
        self.p.wf("start", "feat", cwd=self.p.main)
        self.p.plan(questions="- Which currencies?\n")

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("Questions", result.stderr)
        self.assertEqual(self.p.state()["step"], "plan")

    def test_next_moves_from_plan_to_design_once_questions_are_answered(self):
        self.p.wf("start", "feat", cwd=self.p.main)
        self.p.plan()

        self.assertIn("step: design", self.p.wf("next").stdout)

    def test_next_starts_build_on_the_first_unfinished_story(self):
        self.p.wf("start", "feat", cwd=self.p.main)
        self.p.plan(stories="### Pay by card\n**Design delta**\n#### Not a story\n\n### Refund\n")
        self.p.wf("next")

        out = self.p.wf("next").stdout

        self.assertIn("step: build", out)
        self.assertIn("story: 1/2 Pay by card", self.p.wf("status").stdout)

    def test_next_refuses_to_build_without_stories(self):
        self.p.wf("start", "feat", cwd=self.p.main)
        self.p.plan(stories="")
        self.p.wf("next")

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.p.state()["step"], "design")


class FreezeTest(WfTestCase):
    def test_freeze_records_changed_tests(self):
        self.p.to_build()
        test = self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.write("src/app.txt", "v2\n", root=self.p.worktree)

        out = self.p.wf("freeze").stdout

        self.assertIn("frozen: tests/pay_test.sh", out)
        self.assertNotIn("src/app.txt", out)
        blob = self.p.git(self.p.worktree, "hash-object", str(test))
        self.assertEqual(self.p.state()["pending_freeze"], {"tests/pay_test.sh": blob})

    def test_freeze_refuses_without_changed_tests(self):
        self.p.to_build()
        self.p.write("src/app.txt", "v2\n", root=self.p.worktree)

        result = self.p.wf("freeze", check=False)

        self.assertEqual(result.returncode, 1)


class PrDoneTest(WfTestCase):
    def test_pr_done_commits_with_the_pr_title_when_tests_pass(self):
        self.p.to_build()
        self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.write("src/app.txt", "v2\n", root=self.p.worktree)

        self.p.wf("pr-done", str(self.p.pr_file("01-pay", "Pay by card")))

        self.assertEqual(self.p.git(self.p.worktree, "log", "-1", "--format=%s"), "Pay by card")
        self.assertEqual(self.p.git(self.p.worktree, "status", "--porcelain"), "")
        self.assertEqual(self.p.ran(), ["tests/pay_test.sh"])
        self.assertEqual(self.p.state()["prs"][0]["story"], "Pay by card")

    def test_pr_done_leaves_changes_staged_when_tests_fail(self):
        self.p.to_build()
        before = self.p.head()
        self.p.write("tests/pay_test.sh", "exit 1\n", root=self.p.worktree)

        result = self.p.wf("pr-done", str(self.p.pr_file("01-pay", "Pay by card")), check=False)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.p.head(), before)
        self.assertIn("tests/pay_test.sh", self.p.git(self.p.worktree, "diff", "--cached", "--name-only"))
        self.assertEqual(self.p.state()["prs"], [])

    def test_pr_done_runs_named_related_tests(self):
        self.p.to_build()
        self.p.write("src/app.txt", "v2\n", root=self.p.worktree)

        self.p.wf("pr-done", str(self.p.pr_file("01-tidy", "Tidy the app")), "tests/app_test.sh")

        self.assertEqual(self.p.ran(), ["tests/app_test.sh"])
        self.assertEqual(self.p.state()["prs"][0]["extra_tests"], ["tests/app_test.sh"])

    def test_deleted_tests_are_out_of_scope_and_an_empty_scope_is_refused(self):
        self.p.to_build()
        before = self.p.head()
        (self.p.worktree / "tests" / "app_test.sh").unlink()
        self.p.write("src/app.txt", "v2\n", root=self.p.worktree)

        result = self.p.wf("pr-done", str(self.p.pr_file("01-drop", "Drop the old test")), check=False)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.p.head(), before)
        self.assertEqual(self.p.ran(), [])

    def test_pr_done_uses_the_current_test_command(self):
        self.p.to_build()
        self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.wf("pr-done", str(self.p.pr_file("01-pay", "Pay by card")))
        self.p.config(test_cmd='echo new {files} >> "$TEST_LOG"')
        self.p.write("tests/pay_test.sh", "exit 0 # v2\n", root=self.p.worktree)

        self.p.wf("pr-done", str(self.p.pr_file("02-pay", "Pay again")))

        self.assertEqual(self.p.ran()[-1], "new tests/pay_test.sh")

    def test_pr_done_refuses_a_pr_file_outside_the_prs_folder(self):
        self.p.to_build()
        self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        inside = self.p.write("prs/01-pay.md", "# Pay by card\n", root=self.p.worktree)

        result = self.p.wf("pr-done", str(inside), check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn(str(self.p.feature_dir / "prs"), result.stderr)
        self.assertEqual(self.p.git(self.p.worktree, "diff", "--cached", "--name-only"), "")

    def test_pr_done_binds_the_freeze_snapshot_to_its_pr(self):
        self.p.to_build()
        self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.wf("freeze")

        self.p.wf("pr-done", str(self.p.pr_file("01-pay", "Pay by card")))

        state = self.p.state()
        self.assertEqual(list(state["prs"][0]["frozen"]), ["tests/pay_test.sh"])
        self.assertEqual(state["pending_freeze"], {})


class ModeAndPathTest(WfTestCase):
    def test_step_mode_prints_pause_after_advancing(self):
        self.p.wf("start", "feat", "--mode", "step", cwd=self.p.main)
        self.p.plan()

        out = self.p.wf("next").stdout

        self.assertIn("step: design", out)
        self.assertEqual(out.splitlines()[-1], "PAUSE")
        self.p.wf("mode", "auto")
        self.assertNotIn("PAUSE", self.p.wf("next").stdout)

    def test_next_refuses_to_leave_build_before_the_story_has_a_pr(self):
        self.p.to_build()

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("pr-done", result.stderr)
        self.assertEqual(self.p.state()["step"], "build")

    def test_step_mode_does_not_pause_when_the_run_finishes(self):
        self.p.to_build()
        self.p.commit_pr("01-pay", "Pay by card", test="pay")
        self.p.finish_story()
        self.p.wf("review")
        self.p.wf("mode", "step")

        out = self.p.wf("next").stdout

        self.assertIn("step: done", out)
        self.assertNotIn("PAUSE", out)

    def test_wf_runs_from_a_subdirectory_of_the_worktree(self):
        self.p.wf("start", "feat", cwd=self.p.main)

        out = self.p.wf("status", cwd=self.p.worktree / "src").stdout

        self.assertIn("step: plan", out)
        self.assertIn(f"plan: {self.p.feature_dir / 'plan.md'}", out)


class ReviewTest(WfTestCase):
    def setUp(self):
        super().setUp()
        self.p.to_build(stories="### Pay by card\n\n### Refund\n")
        self.p.commit_pr("01-pay", "Pay by card", test="pay")
        self.p.wf("next")

    def test_brief_lists_the_worktree_range_pr_files_and_rule_files_in_priority_order(self):
        repo_taste = self.p.write(".praxis/taste.md", "- Prefer plain functions\n")
        agents = self.p.write("AGENTS.md", "Team rules\n", root=self.p.worktree)
        global_taste = self.p.write(".praxis/taste.md", "- Name things plainly\n", root=self.p.home)
        head = self.p.head()
        start = self.p.git(self.p.worktree, "rev-parse", "HEAD~1")

        brief = self.p.wf("review").stdout

        self.assertIn(str(self.p.worktree), brief)
        self.assertIn(f"{start}..{head}", brief)
        self.assertIn(str(self.p.feature_dir / "prs" / "01-pay.md"), brief)
        order = [brief.index(str(path)) for path in (repo_taste, agents, global_taste)]
        self.assertEqual(order, sorted(order))
        self.assertNotIn("## Requirements", brief)

    def test_story_range_holds_only_this_storys_prs(self):
        self.p.wf("review")
        self.p.wf("next")
        self.p.commit_pr("02-refund", "Refund", test="refund")
        self.p.wf("next")
        start = self.p.git(self.p.worktree, "rev-parse", "HEAD~1")

        brief = self.p.wf("review").stdout

        self.assertIn(f"{start}..{self.p.head()}", brief)
        self.assertIn("02-refund.md", brief)
        self.assertNotIn("01-pay.md", brief)

    def test_round_four_is_refused(self):
        for _ in range(3):
            self.p.wf("review")

        result = self.p.wf("review", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.p.state()["stories"][0]["rounds"], 3)

    def test_feature_brief_covers_the_whole_branch_and_adds_the_requirements(self):
        self.p.wf("review")
        self.p.wf("next")
        self.p.commit_pr("02-refund", "Refund", test="refund")
        self.p.finish_story()
        plan = self.p.feature_dir / "plan.md"
        plan.write_text(plan.read_text().replace("## Requirements\n", "## Requirements\n- Refunds return the full amount.\n"))

        brief = self.p.wf("review").stdout

        self.assertIn(f"{self.p.state()['base']['sha']}..{self.p.head()}", brief)
        self.assertIn("Refunds return the full amount.", brief)
        self.assertIn("01-pay.md", brief)
        self.assertIn("02-refund.md", brief)


class GateTest(WfTestCase):
    def setUp(self):
        super().setUp()
        self.p.to_build(stories="### Pay by card\n\n### Refund\n")
        self.p.commit_pr("01-pay", "Pay by card", test="pay")
        self.pay = self.p.head()
        self.p.commit_pr("02-tidy", "Tidy the app", extra=("tests/app_test.sh",))

    def fixup(self, target, path, text):
        self.p.write(path, text, root=self.p.worktree)
        self.p.git(self.p.worktree, "add", "-A")
        self.p.git(self.p.worktree, "commit", "-q", "--fixup", target)
        self.p.git(self.p.worktree, "rebase", "-q", "--autosquash", self.p.state()["base"]["sha"])

    def test_next_refuses_before_any_review_round(self):
        self.p.wf("next")

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("wf review", result.stderr)

    def test_gate_passes_when_every_commit_maps_to_a_green_pr_and_marks_the_story_done(self):
        self.p.wf("next")
        self.p.wf("review")
        open(self.p.log, "w").close()

        out = self.p.wf("next").stdout

        self.assertIn("story: Refund", out)
        self.assertEqual(self.p.ran(), ["tests/pay_test.sh", "tests/app_test.sh"])
        self.assertTrue(self.p.state()["stories"][0]["done"])

    def test_gate_still_maps_after_autosquash_and_runs_tests_a_fixup_added(self):
        self.p.wf("next")
        self.p.wf("review")
        self.fixup(self.pay, "tests/card_test.sh", "exit 0\n")
        open(self.p.log, "w").close()

        self.p.wf("next")

        self.assertEqual(self.p.ran(), ["tests/card_test.sh tests/pay_test.sh", "tests/app_test.sh"])

    def test_gate_names_a_commit_that_matches_no_pr(self):
        self.p.wf("next")
        self.p.wf("review")
        self.p.write("src/app.txt", "stray\n", root=self.p.worktree)
        self.p.git(self.p.worktree, "commit", "-q", "-am", "Stray change")

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("Stray change", result.stderr)

    def test_gate_names_a_red_commit_and_returns_to_the_branch(self):
        self.p.wf("next")
        self.p.wf("review")
        self.fixup(self.pay, "tests/pay_test.sh", "exit 1\n")
        tip = self.p.head()

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertIn("Pay by card", result.stderr)
        self.assertEqual(self.p.git(self.p.worktree, "branch", "--show-current"), "feat")
        self.assertEqual(self.p.head(), tip)
        self.assertFalse(self.p.state()["stories"][0]["done"])

    def test_gate_refuses_a_dirty_worktree(self):
        self.p.wf("next")
        self.p.wf("review")
        self.p.write("notes.txt", "scratch\n", root=self.p.worktree)

        result = self.p.wf("next", check=False)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.p.ran()[-1], "tests/app_test.sh")


class DoneTest(WfTestCase):
    def test_done_reports_tests_changed_after_freeze_but_not_tests_a_later_pr_edits(self):
        self.p.to_build()
        self.p.write("tests/pay_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.wf("freeze")
        self.p.commit_pr("01-pay", "Pay by card")
        self.p.write("tests/refund_test.sh", "exit 0\n", root=self.p.worktree)
        self.p.wf("freeze")
        self.p.write("tests/refund_test.sh", "exit 0 # loosened\n", root=self.p.worktree)
        self.p.write("tests/pay_test.sh", "exit 0 # extended\n", root=self.p.worktree)
        self.p.commit_pr("02-refund", "Refund")
        self.p.finish_story()
        self.p.wf("review")

        out = self.p.wf("next").stdout

        self.assertIn("step: done", out)
        self.assertIn("changed_after_freeze: 02-refund.md tests/refund_test.sh", out)
        self.assertNotIn("01-pay.md", out)


class PublishTest(WfTestCase):
    def setUp(self):
        super().setUp()
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        gh = bin_dir / "gh"
        gh.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys\n"
            "args = sys.argv[1:]\n"
            "body = open(args[args.index('--body-file') + 1]).read()\n"
            "with open(os.environ['GH_LOG'], 'a') as log:\n"
            "    log.write(json.dumps({'args': args, 'body': body}) + '\\n')\n"
            "print('https://github.example/pr/' + args[args.index('--head') + 1])\n"
        )
        gh.chmod(0o755)
        self.gh_log = self.tmp / "gh.log"
        self.p.env["PATH"] = f"{bin_dir}{os.pathsep}{self.p.env['PATH']}"
        self.p.env["GH_LOG"] = str(self.gh_log)

    def test_publish_pushes_a_branch_per_pr_and_stacks_the_prs(self):
        self.p.to_build()
        self.p.commit_pr("01-pay", "Pay by card", test="pay")
        first = self.p.head()
        self.p.commit_pr("02-refund", "Refund", test="refund")
        second = self.p.head()
        self.p.finish_story()
        self.p.wf("review")
        self.p.wf("next")

        out = self.p.wf("publish").stdout

        remote = self.p.git(self.p.main, "ls-remote", str(self.p.origin))
        self.assertIn(f"{first}\trefs/heads/feat-01-pay", remote)
        self.assertIn(f"{second}\trefs/heads/feat-02-refund", remote)
        calls = [json.loads(line) for line in self.gh_log.read_text().splitlines()]
        self.assertEqual([call["args"][call["args"].index("--base") + 1] for call in calls], ["main", "feat-01-pay"])
        self.assertEqual(calls[0]["args"][calls[0]["args"].index("--title") + 1], "Pay by card")
        self.assertEqual(calls[0]["body"], "Why and what.\n")
        self.assertIn("https://github.example/pr/feat-02-refund", out)


if __name__ == "__main__":
    unittest.main()
