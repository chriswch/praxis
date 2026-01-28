#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Iterable


ALLOWED_PRIORITIES = {"P0", "P1", "P2", "P3"}
ALLOWED_STATUSES = {
    "backlog",
    "ready",
    "in_progress",
    "blocked",
    "in_review",
    "done",
    "won_t_do",
}
ALLOWED_TYPES = {"user_story", "task", "bug"}
ID_PREFIX_BY_TYPE = {"user_story": "US-", "task": "TASK-", "bug": "BUG-"}
ALLOWED_ESTIMATE_METHODS = {"story_points", "ideal_hours", "t_shirt", "unknown"}
ALLOWED_TSHIRT = {"XS", "S", "M", "L", "XL"}
ALLOWED_TASK_KINDS = {
    "implementation",
    "test",
    "docs",
    "spike",
    "refactor",
    "ops",
    "analytics",
    "release",
}
ALLOWED_SEVERITIES = {"S0", "S1", "S2", "S3"}
ALLOWED_QUESTION_TYPES = {"blocker", "nice_to_have"}
ALLOWED_QUESTION_OWNERS = {"product", "engineering", "design", "qa", "security", "data", "tbd"}


def _is_str_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _add_err(errors: list[str], path: str, msg: str) -> None:
    errors.append(f"{path}: {msg}")


def _require_key(
    obj: dict[str, Any],
    key: str,
    *,
    path: str,
    errors: list[str],
    expected: str,
) -> Any:
    if key not in obj:
        _add_err(errors, path, f"missing required field '{key}' ({expected})")
        return None
    return obj[key]


def _validate_iso_utc(ts: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", ts))


def _iter_dicts(value: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def validate_issue_bundle(bundle: Any, *, strict: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(bundle, dict):
        return (["$ : top-level JSON must be an object"], warnings)

    meta = _require_key(bundle, "meta", path="$", errors=errors, expected="object")
    epics = _require_key(bundle, "epics", path="$", errors=errors, expected="array")
    issues = _require_key(bundle, "issues", path="$", errors=errors, expected="array")

    epic_ids: set[str] = set()
    issue_ids: set[str] = set()
    issue_type_by_id: dict[str, str] = {}

    if isinstance(meta, dict):
        project = _require_key(meta, "project", path="$.meta", errors=errors, expected="string")
        if project is not None and not _is_nonempty_str(project):
            _add_err(errors, "$.meta.project", "must be a non-empty string")

        source = _require_key(meta, "source", path="$.meta", errors=errors, expected="string")
        if source is not None and not _is_nonempty_str(source):
            _add_err(errors, "$.meta.source", "must be a non-empty string")

        generated_at = _require_key(
            meta, "generated_at", path="$.meta", errors=errors, expected="string (ISO-8601 UTC)"
        )
        if generated_at is not None:
            if not isinstance(generated_at, str):
                _add_err(errors, "$.meta.generated_at", "must be a string")
            elif strict and not _validate_iso_utc(generated_at):
                _add_err(
                    errors,
                    "$.meta.generated_at",
                    "must match YYYY-MM-DDTHH:MM:SSZ",
                )

        assumptions = _require_key(meta, "assumptions", path="$.meta", errors=errors, expected="string[]")
        if assumptions is not None and not _is_str_list(assumptions):
            _add_err(errors, "$.meta.assumptions", "must be an array of strings")

        open_questions = _require_key(
            meta, "open_questions", path="$.meta", errors=errors, expected="OpenQuestion[]"
        )
        if open_questions is not None:
            if not isinstance(open_questions, list):
                _add_err(errors, "$.meta.open_questions", "must be an array")
            else:
                for idx, q in enumerate(open_questions):
                    q_path = f"$.meta.open_questions[{idx}]"
                    if not isinstance(q, dict):
                        _add_err(errors, q_path, "must be an object")
                        continue
                    q_id = _require_key(q, "id", path=q_path, errors=errors, expected="string")
                    if q_id is not None:
                        if not isinstance(q_id, str) or not re.fullmatch(r"Q-\d{3}", q_id):
                            _add_err(errors, f"{q_path}.id", "must match Q-###")
                    q_type = _require_key(q, "type", path=q_path, errors=errors, expected="blocker|nice_to_have")
                    if q_type is not None and q_type not in ALLOWED_QUESTION_TYPES:
                        _add_err(errors, f"{q_path}.type", f"must be one of {sorted(ALLOWED_QUESTION_TYPES)}")
                    owner = _require_key(
                        q, "owner", path=q_path, errors=errors, expected="product|engineering|design|qa|security|data|tbd"
                    )
                    if owner is not None and owner not in ALLOWED_QUESTION_OWNERS:
                        _add_err(errors, f"{q_path}.owner", f"must be one of {sorted(ALLOWED_QUESTION_OWNERS)}")
                    question = _require_key(q, "question", path=q_path, errors=errors, expected="string")
                    if question is not None and not _is_nonempty_str(question):
                        _add_err(errors, f"{q_path}.question", "must be a non-empty string")
                    if "context" in q and not isinstance(q["context"], str):
                        _add_err(errors, f"{q_path}.context", "must be a string when present")
    else:
        _add_err(errors, "$.meta", "must be an object")

    if isinstance(epics, list):
        for idx, epic in enumerate(epics):
            e_path = f"$.epics[{idx}]"
            if not isinstance(epic, dict):
                _add_err(errors, e_path, "must be an object")
                continue
            e_id = _require_key(epic, "id", path=e_path, errors=errors, expected="E-###")
            if e_id is not None:
                if not isinstance(e_id, str) or not re.fullmatch(r"E-\d{3}", e_id):
                    _add_err(errors, f"{e_path}.id", "must match E-###")
                elif e_id in epic_ids:
                    _add_err(errors, f"{e_path}.id", "duplicate epic id")
                else:
                    epic_ids.add(e_id)
            title = _require_key(epic, "title", path=e_path, errors=errors, expected="string")
            if title is not None and not _is_nonempty_str(title):
                _add_err(errors, f"{e_path}.title", "must be a non-empty string")
            objective = _require_key(epic, "objective", path=e_path, errors=errors, expected="string")
            if objective is not None and not _is_nonempty_str(objective):
                _add_err(errors, f"{e_path}.objective", "must be a non-empty string")
            exit_criteria = _require_key(epic, "exit_criteria", path=e_path, errors=errors, expected="string[]")
            if exit_criteria is not None and not _is_str_list(exit_criteria):
                _add_err(errors, f"{e_path}.exit_criteria", "must be an array of strings")
            if "non_goals" in epic and not _is_str_list(epic["non_goals"]):
                _add_err(errors, f"{e_path}.non_goals", "must be an array of strings when present")
    else:
        _add_err(errors, "$.epics", "must be an array")

    if isinstance(issues, list):
        for idx, issue in enumerate(issues):
            i_path = f"$.issues[{idx}]"
            if not isinstance(issue, dict):
                _add_err(errors, i_path, "must be an object")
                continue

            issue_id = _require_key(issue, "id", path=i_path, errors=errors, expected="string")
            if isinstance(issue_id, str):
                if issue_id in issue_ids:
                    _add_err(errors, f"{i_path}.id", "duplicate issue id")
                else:
                    issue_ids.add(issue_id)

            issue_type = _require_key(issue, "type", path=i_path, errors=errors, expected="user_story|task|bug")
            if issue_type is not None and issue_type not in ALLOWED_TYPES:
                _add_err(errors, f"{i_path}.type", f"must be one of {sorted(ALLOWED_TYPES)}")
            if isinstance(issue_id, str) and isinstance(issue_type, str) and issue_type in ID_PREFIX_BY_TYPE:
                prefix = ID_PREFIX_BY_TYPE[issue_type]
                if not re.fullmatch(rf"{re.escape(prefix)}\d{{3}}", issue_id):
                    _add_err(errors, f"{i_path}.id", f"must match {prefix}### for type '{issue_type}'")
                else:
                    issue_type_by_id[issue_id] = issue_type

            for key in ["title", "description"]:
                value = _require_key(issue, key, path=i_path, errors=errors, expected="string")
                if value is not None and not _is_nonempty_str(value):
                    _add_err(errors, f"{i_path}.{key}", "must be a non-empty string")

            priority = _require_key(issue, "priority", path=i_path, errors=errors, expected="P0|P1|P2|P3")
            if priority is not None and priority not in ALLOWED_PRIORITIES:
                _add_err(errors, f"{i_path}.priority", f"must be one of {sorted(ALLOWED_PRIORITIES)}")

            status = _require_key(issue, "status", path=i_path, errors=errors, expected="status string")
            if status is not None and status not in ALLOWED_STATUSES:
                _add_err(errors, f"{i_path}.status", f"must be one of {sorted(ALLOWED_STATUSES)}")

            labels = _require_key(issue, "labels", path=i_path, errors=errors, expected="string[]")
            if labels is not None and not _is_str_list(labels):
                _add_err(errors, f"{i_path}.labels", "must be an array of strings")

            blocked_by = _require_key(issue, "blocked_by", path=i_path, errors=errors, expected="string[]")
            if blocked_by is not None and not _is_str_list(blocked_by):
                _add_err(errors, f"{i_path}.blocked_by", "must be an array of strings")

            estimate = _require_key(issue, "estimate", path=i_path, errors=errors, expected="object")
            if estimate is not None:
                if not isinstance(estimate, dict):
                    _add_err(errors, f"{i_path}.estimate", "must be an object")
                else:
                    method = _require_key(
                        estimate, "method", path=f"{i_path}.estimate", errors=errors, expected="estimate method"
                    )
                    value = _require_key(
                        estimate, "value", path=f"{i_path}.estimate", errors=errors, expected="estimate value"
                    )
                    if method is not None and method not in ALLOWED_ESTIMATE_METHODS:
                        _add_err(
                            errors,
                            f"{i_path}.estimate.method",
                            f"must be one of {sorted(ALLOWED_ESTIMATE_METHODS)}",
                        )
                    elif method == "story_points":
                        if not isinstance(value, int) or value <= 0:
                            _add_err(errors, f"{i_path}.estimate.value", "must be a positive integer for story_points")
                    elif method == "ideal_hours":
                        if not isinstance(value, (int, float)) or value <= 0:
                            _add_err(errors, f"{i_path}.estimate.value", "must be a positive number for ideal_hours")
                    elif method == "t_shirt":
                        if not isinstance(value, str) or value not in ALLOWED_TSHIRT:
                            _add_err(errors, f"{i_path}.estimate.value", f"must be one of {sorted(ALLOWED_TSHIRT)}")
                    elif method == "unknown":
                        if value is not None:
                            _add_err(errors, f"{i_path}.estimate.value", "must be null when method is unknown")

            if "epic_id" in issue:
                epic_id = issue["epic_id"]
                if epic_id is not None and not isinstance(epic_id, str):
                    _add_err(errors, f"{i_path}.epic_id", "must be a string or null when present")

            if "parent_id" in issue:
                parent_id = issue["parent_id"]
                if parent_id is not None and not isinstance(parent_id, str):
                    _add_err(errors, f"{i_path}.parent_id", "must be a string or null when present")

            if "acceptance_criteria" in issue:
                ac = issue["acceptance_criteria"]
                if not _is_str_list(ac):
                    _add_err(errors, f"{i_path}.acceptance_criteria", "must be an array of strings when present")

            if "definition_of_done" in issue and not _is_str_list(issue["definition_of_done"]):
                _add_err(errors, f"{i_path}.definition_of_done", "must be an array of strings when present")

            if issue_type == "user_story":
                for key in ["persona", "story", "value"]:
                    value = _require_key(issue, key, path=i_path, errors=errors, expected="string")
                    if value is not None and not _is_nonempty_str(value):
                        _add_err(errors, f"{i_path}.{key}", "must be a non-empty string")
                ac = issue.get("acceptance_criteria")
                if not _is_str_list(ac) or len(ac) == 0:
                    _add_err(errors, f"{i_path}.acceptance_criteria", "must be a non-empty array of strings")
                if "parent_id" in issue and issue.get("parent_id") is not None:
                    _add_err(errors, f"{i_path}.parent_id", "must be omitted/null for user_story")

            if issue_type == "task":
                task_kind = _require_key(
                    issue, "task_kind", path=i_path, errors=errors, expected=f"one of {sorted(ALLOWED_TASK_KINDS)}"
                )
                if task_kind is not None and task_kind not in ALLOWED_TASK_KINDS:
                    _add_err(errors, f"{i_path}.task_kind", f"must be one of {sorted(ALLOWED_TASK_KINDS)}")
                for key in ["deliverable", "verification"]:
                    value = _require_key(issue, key, path=i_path, errors=errors, expected="string")
                    if value is not None and not _is_nonempty_str(value):
                        _add_err(errors, f"{i_path}.{key}", "must be a non-empty string")

            if issue_type == "bug":
                severity = _require_key(
                    issue, "severity", path=i_path, errors=errors, expected=f"one of {sorted(ALLOWED_SEVERITIES)}"
                )
                if severity is not None and severity not in ALLOWED_SEVERITIES:
                    _add_err(errors, f"{i_path}.severity", f"must be one of {sorted(ALLOWED_SEVERITIES)}")
                for key in ["environment", "expected", "actual"]:
                    value = _require_key(issue, key, path=i_path, errors=errors, expected="string")
                    if value is not None and not _is_nonempty_str(value):
                        _add_err(errors, f"{i_path}.{key}", "must be a non-empty string")
                steps = _require_key(issue, "steps_to_reproduce", path=i_path, errors=errors, expected="string[]")
                if steps is not None and (not _is_str_list(steps) or len(steps) == 0):
                    _add_err(errors, f"{i_path}.steps_to_reproduce", "must be a non-empty array of strings")
                ac = issue.get("acceptance_criteria")
                if not _is_str_list(ac) or len(ac) == 0:
                    _add_err(errors, f"{i_path}.acceptance_criteria", "must be a non-empty array of strings")
    else:
        _add_err(errors, "$.issues", "must be an array")

    # Cross-reference checks (only if we have a coherent issue set)
    if isinstance(issues, list):
        for idx, issue in enumerate(issues):
            if not isinstance(issue, dict):
                continue
            i_path = f"$.issues[{idx}]"

            epic_id = issue.get("epic_id")
            if isinstance(epic_id, str) and epic_id not in epic_ids:
                _add_err(errors, f"{i_path}.epic_id", f"unknown epic id '{epic_id}'")

            parent_id = issue.get("parent_id")
            if isinstance(parent_id, str):
                if parent_id not in issue_ids:
                    _add_err(errors, f"{i_path}.parent_id", f"unknown issue id '{parent_id}'")
                else:
                    if issue.get("type") in {"task", "bug"} and not parent_id.startswith("US-"):
                        _add_err(errors, f"{i_path}.parent_id", "tasks/bugs must parent a User Story (US-###)")

            blocked_by = issue.get("blocked_by")
            if isinstance(blocked_by, list):
                issue_id = issue.get("id")
                for dep in blocked_by:
                    if isinstance(issue_id, str) and dep == issue_id:
                        _add_err(errors, f"{i_path}.blocked_by", "must not contain itself")
                    if isinstance(dep, str) and dep not in issue_ids:
                        _add_err(errors, f"{i_path}.blocked_by", f"unknown dependency id '{dep}'")

    # Cycle detection (treat as warning unless strict)
    graph: dict[str, set[str]] = {}
    for issue in _iter_dicts(issues):
        issue_id = issue.get("id")
        if not isinstance(issue_id, str):
            continue
        deps = issue.get("blocked_by")
        if isinstance(deps, list):
            graph[issue_id] = {d for d in deps if isinstance(d, str)}
        else:
            graph[issue_id] = set()

    visiting: set[str] = set()
    visited: set[str] = set()
    cycle_found: list[str] = []

    def dfs(node: str) -> None:
        if node in visited or cycle_found:
            return
        if node in visiting:
            cycle_found.append(node)
            return
        visiting.add(node)
        for dep in graph.get(node, set()):
            dfs(dep)
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        dfs(node)
        if cycle_found:
            break

    if cycle_found:
        msg = "dependency cycle detected involving: " + ", ".join(cycle_found)
        if strict:
            errors.append(f"$: {msg}")
        else:
            warnings.append(f"$: {msg}")

    return (errors, warnings)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate an agile-issue-splitter Issue Bundle JSON file.")
    parser.add_argument("path", help="Path to issue-bundle.json")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Enable stricter checks (timestamp format and dependency cycles are errors).",
    )
    args = parser.parse_args(argv)

    try:
        with open(args.path, "r", encoding="utf-8") as f:
            bundle = json.load(f)
    except FileNotFoundError:
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON: {e}", file=sys.stderr)
        return 2

    errors, warnings = validate_issue_bundle(bundle, strict=args.strict)

    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    for e in errors:
        print(f"error: {e}", file=sys.stderr)

    if errors:
        print(f"invalid: {len(errors)} error(s), {len(warnings)} warning(s)", file=sys.stderr)
        return 1

    print(f"valid: {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
