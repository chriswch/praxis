import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = SKILL_DIR.parent
PLAN_SKELETON = "## Requirements\n\n## Questions\n\n## Stories\n\n## Design\n\n## Findings\n"
FEATURE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


class WfError(Exception):
    pass


def git(*args, cwd):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise WfError(f"git {' '.join(args)}: {(result.stderr or result.stdout).strip()}")
    return result.stdout.rstrip("\n")


def shell(command, cwd, env=None):
    sys.stdout.flush()
    return subprocess.run(command, shell=True, cwd=cwd, env=env).returncode


def main_checkout(cwd):
    return Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=cwd)).resolve().parent


class Feature:
    def __init__(self, main, name):
        self.main = main
        self.name = name
        self.dir = main / ".praxis" / name
        self.worktree = self.dir / "worktree"
        self.plan = self.dir / "plan.md"
        self.prs = self.dir / "prs"
        self.state_file = self.dir / "state.json"

    @classmethod
    def from_cwd(cls, cwd):
        top = Path(git("rev-parse", "--show-toplevel", cwd=cwd)).resolve()
        main = main_checkout(cwd)
        if top.name != "worktree" or top.parent.parent != main / ".praxis":
            raise WfError("run wf inside a feature worktree: <repo>/.praxis/<feature>/worktree")
        return cls(main, top.parent.name)

    def load(self):
        return json.loads(self.state_file.read_text(encoding="utf-8"))

    def save(self, state):
        fd, tmp = tempfile.mkstemp(dir=self.dir, prefix=".state-")
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(state, file, indent=2, ensure_ascii=False)
            file.write("\n")
        os.replace(tmp, self.state_file)

    def read_plan(self):
        try:
            return self.plan.read_text(encoding="utf-8")
        except FileNotFoundError:
            raise WfError(f"{self.plan} is missing")


def load_config(main):
    path = main / ".praxis" / "config.json"
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise WfError(f"{path} is missing: write test_cmd, test_glob, and an optional setup")
    except ValueError as error:
        raise WfError(f"{path} is not valid JSON: {error}")
    if not isinstance(config, dict):
        raise WfError(f"{path} must hold a JSON object")
    for key in ("test_cmd", "test_glob"):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise WfError(f"{path} needs a {key} string")
    if "{files}" not in config["test_cmd"]:
        raise WfError(f"{path}: test_cmd must contain {{files}}, where wf puts the test files to run")
    if not isinstance(config.get("setup", ""), str):
        raise WfError(f"{path}: setup must be a string")
    return config


def glob_regex(pattern):
    parts = []
    for token in re.split(r"(\*\*/|\*\*|\*|\?)", pattern):
        if token == "**/":
            parts.append("(?:.*/)?")
        elif token == "**":
            parts.append(".*")
        elif token == "*":
            parts.append("[^/]*")
        elif token == "?":
            parts.append("[^/]")
        else:
            parts.append(re.escape(token))
    return re.compile("".join(parts) + r"\Z")


def test_scope(changed, extra, config, root):
    pattern = glob_regex(config["test_glob"])
    files = [path for path in changed if path and pattern.match(path)] + list(extra)
    return sorted({path for path in files if (root / path).is_file()})


def run_tests(config, files, cwd):
    print(f"tests: {' '.join(files)}")
    command = config["test_cmd"].replace("{files}", " ".join(shlex.quote(path) for path in files))
    return shell(command, cwd) == 0


def section(text, name):
    match = re.search(rf"^## {re.escape(name)}[ \t]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1) if match else ""


def plan_stories(feature):
    return [match.group(1).strip() for match in re.finditer(r"^### (.+)$", section(feature.read_plan(), "Stories"), re.M)]


def current_story(state):
    return next((story for story in state["stories"] if not story["done"]), None)


def start_next_story(feature, state):
    done = {story["title"] for story in state["stories"] if story["done"]}
    title = next((title for title in plan_stories(feature) if title not in done), None)
    if title is not None:
        state["stories"].append({"title": title, "rounds": 0, "done": False})
        state["step"] = "build"
    return title


def require_step(state, step, command):
    if state["step"] != step:
        raise WfError(f"{command} runs during {step}; the run is at {state['step']}")


def pr_title(path):
    try:
        first = path.read_text(encoding="utf-8").split("\n", 1)[0]
    except FileNotFoundError:
        raise WfError(f"{path} is missing")
    if not first.startswith("# ") or not first[2:].strip():
        raise WfError(f"{path}: the first line must be '# <title>'")
    return first[2:].strip()


def worktree_path(feature, arg):
    path = Path(arg).resolve()
    try:
        relative = path.relative_to(feature.worktree.resolve())
    except ValueError:
        raise WfError(f"{arg} is outside the worktree")
    if not path.is_file():
        raise WfError(f"{arg} is missing")
    return relative.as_posix()


def run_setup(config, feature):
    setup = config.get("setup")
    if setup:
        print(f"setup: {setup}")
        if shell(setup, feature.worktree, {**os.environ, "WF_MAIN": str(feature.main)}) != 0:
            raise WfError(f"setup failed: {setup}")


def add_exclude(main):
    exclude = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=main)) / "info" / "exclude"
    text = exclude.read_text() if exclude.exists() else ""
    if ".praxis/" not in text.splitlines():
        exclude.parent.mkdir(exist_ok=True)
        exclude.write_text(text + ("" if text.endswith("\n") or not text else "\n") + ".praxis/\n")


def default_branch(main):
    match = re.match(r"ref: refs/heads/(\S+)\tHEAD", git("ls-remote", "--symref", "origin", "HEAD", cwd=main))
    if not match:
        raise WfError("cannot tell the default branch of origin")
    return match.group(1)


def cmd_start(args):
    main = main_checkout(Path.cwd())
    if not FEATURE_NAME.fullmatch(args.feature):
        raise WfError("a feature name uses letters, digits, '.', '_' and '-' only")
    feature = Feature(main, args.feature)
    config = load_config(main)
    if not feature.worktree.exists():
        git("fetch", "-q", "origin", cwd=main)
        default = default_branch(main)
        sha = git("rev-parse", f"origin/{default}", cwd=main)
        add_exclude(main)
        feature.prs.mkdir(parents=True, exist_ok=True)
        git("worktree", "add", "-q", "--no-track", "-b", feature.name, str(feature.worktree), f"origin/{default}", cwd=main)
        if not feature.plan.exists():
            feature.plan.write_text(PLAN_SKELETON, encoding="utf-8")
        feature.save({
            "mode": args.mode,
            "step": "plan",
            "base": {"ref": default, "sha": sha},
            "stories": [],
            "feature_rounds": 0,
            "pending_freeze": {},
            "prs": [],
        })
    run_setup(config, feature)
    print(f"worktree: {feature.worktree}")
    print(f"plan: {feature.plan}")


def cmd_status(feature, args):
    state = feature.load()
    titles = plan_stories(feature) if feature.plan.exists() else []
    print(f"feature: {feature.name}")
    print(f"mode: {state['mode']}")
    print(f"step: {state['step']}")
    story = current_story(state)
    if story:
        number = titles.index(story["title"]) + 1 if story["title"] in titles else "?"
        print(f"story: {number}/{len(titles)} {story['title']}")
    if state["step"] == "review":
        print(f"rounds: {story['rounds']}")
    if state["step"] == "feature":
        print(f"rounds: {state['feature_rounds']}")
    print(f"base: {state['base']['ref']} {state['base']['sha']}")
    print(f"worktree: {feature.worktree}")
    print(f"plan: {feature.plan}")
    print(f"repo_taste: {feature.main / '.praxis' / 'taste.md'}")
    print(f"config: {feature.main / '.praxis' / 'config.json'}")
    for skill in sorted(SKILLS_DIR.glob("*/SKILL.md")):
        if skill.parent != SKILL_DIR:
            print(f"skill: {skill}")


def cmd_mode(feature, args):
    state = feature.load()
    state["mode"] = args.mode
    feature.save(state)
    print(f"mode: {args.mode}")


def cmd_next(feature, args):
    state = feature.load()
    step = state["step"]
    if step == "plan":
        if section(feature.read_plan(), "Questions").strip():
            raise WfError("§Questions is not empty: merge each answer into the plan and remove the question")
        state["step"] = "design"
    elif step == "design":
        if start_next_story(feature, state) is None:
            raise WfError(f"{feature.plan} has no '### ' story under ## Stories")
    elif step == "build":
        state["step"] = "review"
    else:
        raise WfError(f"next cannot leave {step} yet")
    feature.save(state)
    print(f"step: {state['step']}")
    story = current_story(state)
    if story and state["step"] in ("build", "review"):
        print(f"story: {story['title']}")
    if state["mode"] == "step":
        print("PAUSE")


def worktree_changes(feature):
    tracked = git("diff", "--name-only", "-z", "HEAD", cwd=feature.worktree).split("\0")
    untracked = git("ls-files", "-z", "--others", "--exclude-standard", cwd=feature.worktree).split("\0")
    return sorted({path for path in tracked + untracked if path})


def cmd_freeze(feature, args):
    state = feature.load()
    require_step(state, "build", "freeze")
    config = load_config(feature.main)
    tests = test_scope(worktree_changes(feature), [], config, feature.worktree)
    if not tests:
        raise WfError(f"no changed test file matches {config['test_glob']}: write the tests first")
    state["pending_freeze"] = {path: git("hash-object", "-w", "--", path, cwd=feature.worktree) for path in tests}
    feature.save(state)
    for path in tests:
        print(f"frozen: {path}")


def cmd_pr_done(feature, args):
    state = feature.load()
    require_step(state, "build", "pr-done")
    pr_file = Path(args.pr_file).resolve()
    title = pr_title(pr_file)
    if any(pr["file"] == str(pr_file) for pr in state["prs"]):
        raise WfError(f"{pr_file} is already registered")
    extra = [worktree_path(feature, arg) for arg in args.tests]
    config = load_config(feature.main)
    git("add", "-A", cwd=feature.worktree)
    staged = git("diff", "--cached", "--name-only", "-z", cwd=feature.worktree).split("\0")
    tests = test_scope(staged, extra, config, feature.worktree)
    if not tests:
        raise WfError(f"no test to run: change a test matching {config['test_glob']} or name related tests")
    if not run_tests(config, tests, feature.worktree):
        raise WfError("tests failed; the changes stay staged")
    git("commit", "-q", "-m", title, cwd=feature.worktree)
    state["prs"].append({
        "file": str(pr_file),
        "title": title,
        "story": current_story(state)["title"],
        "extra_tests": extra,
        "frozen": state["pending_freeze"],
    })
    state["pending_freeze"] = {}
    feature.save(state)
    print(f"commit: {git('rev-parse', '--short', 'HEAD', cwd=feature.worktree)} {title}")


COMMANDS = {
    "status": cmd_status,
    "mode": cmd_mode,
    "next": cmd_next,
    "freeze": cmd_freeze,
    "pr-done": cmd_pr_done,
}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="wf", description="Praxis workflow state and checks.")
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start", help="open a worktree for a new feature, or rerun its setup")
    start.add_argument("feature")
    start.add_argument("--mode", choices=["auto", "step"], default="auto")
    commands.add_parser("status", help="print where the run is")
    mode = commands.add_parser("mode", help="switch between auto and step mode")
    mode.add_argument("mode", choices=["auto", "step"])
    commands.add_parser("next", help="check the current step and move on")
    commands.add_parser("freeze", help="snapshot the changed tests before implementing")
    pr_done = commands.add_parser("pr-done", help="run the PR's tests and commit it when green")
    pr_done.add_argument("pr_file")
    pr_done.add_argument("tests", nargs="*", help="existing tests that cover the changed code")
    args = parser.parse_args(argv)
    try:
        if args.command == "start":
            cmd_start(args)
        else:
            COMMANDS[args.command](Feature.from_cwd(Path.cwd()), args)
    except WfError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
