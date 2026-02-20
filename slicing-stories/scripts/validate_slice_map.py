#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any


ALLOWED_QUESTION_OWNERS = {"product", "engineering", "design", "tbd"}


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


def validate_slice_map(bundle: Any, *, strict: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(bundle, dict):
        return (["$ : top-level JSON must be an object"], warnings)

    meta = _require_key(bundle, "meta", path="$", errors=errors, expected="object")
    slices = _require_key(bundle, "slices", path="$", errors=errors, expected="array")

    # --- meta ---
    if isinstance(meta, dict):
        for key in ["project", "source", "feature_summary"]:
            value = _require_key(meta, key, path="$.meta", errors=errors, expected="string")
            if value is not None and not _is_nonempty_str(value):
                _add_err(errors, f"$.meta.{key}", "must be a non-empty string")

        generated_at = _require_key(
            meta, "generated_at", path="$.meta", errors=errors, expected="string (ISO-8601 UTC)"
        )
        if generated_at is not None:
            if not isinstance(generated_at, str):
                _add_err(errors, "$.meta.generated_at", "must be a string")
            elif strict and not _validate_iso_utc(generated_at):
                _add_err(errors, "$.meta.generated_at", "must match YYYY-MM-DDTHH:MM:SSZ")

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
                q_ids: set[str] = set()
                for idx, q in enumerate(open_questions):
                    q_path = f"$.meta.open_questions[{idx}]"
                    if not isinstance(q, dict):
                        _add_err(errors, q_path, "must be an object")
                        continue
                    q_id = _require_key(q, "id", path=q_path, errors=errors, expected="string")
                    if q_id is not None:
                        if not isinstance(q_id, str) or not re.fullmatch(r"Q-\d{3}", q_id):
                            _add_err(errors, f"{q_path}.id", "must match Q-###")
                        elif q_id in q_ids:
                            _add_err(errors, f"{q_path}.id", f"duplicate question id '{q_id}'")
                        else:
                            q_ids.add(q_id)
                    question = _require_key(q, "question", path=q_path, errors=errors, expected="string")
                    if question is not None and not _is_nonempty_str(question):
                        _add_err(errors, f"{q_path}.question", "must be a non-empty string")
                    blocking = _require_key(q, "blocking", path=q_path, errors=errors, expected="boolean")
                    if blocking is not None and not isinstance(blocking, bool):
                        _add_err(errors, f"{q_path}.blocking", "must be a boolean")
                    owner = _require_key(q, "owner", path=q_path, errors=errors, expected="product|engineering|design|tbd")
                    if owner is not None and owner not in ALLOWED_QUESTION_OWNERS:
                        _add_err(errors, f"{q_path}.owner", f"must be one of {sorted(ALLOWED_QUESTION_OWNERS)}")
    else:
        _add_err(errors, "$.meta", "must be an object")

    # --- slices ---
    if isinstance(slices, list):
        if len(slices) == 0:
            _add_err(errors, "$.slices", "must not be empty")

        slice_ids: set[str] = set()
        for idx, s in enumerate(slices):
            s_path = f"$.slices[{idx}]"
            if not isinstance(s, dict):
                _add_err(errors, s_path, "must be an object")
                continue

            s_id = _require_key(s, "id", path=s_path, errors=errors, expected="string")
            if s_id is not None:
                if not isinstance(s_id, str) or not re.fullmatch(r"S-\d{3}", s_id):
                    _add_err(errors, f"{s_path}.id", "must match S-###")
                elif s_id in slice_ids:
                    _add_err(errors, f"{s_path}.id", f"duplicate slice id '{s_id}'")
                else:
                    slice_ids.add(s_id)

            for key in ["title", "story", "sequence_rationale"]:
                value = _require_key(s, key, path=s_path, errors=errors, expected="string")
                if value is not None and not _is_nonempty_str(value):
                    _add_err(errors, f"{s_path}.{key}", "must be a non-empty string")

            for key in ["scope_in", "scope_out"]:
                value = _require_key(s, key, path=s_path, errors=errors, expected="string[]")
                if value is not None:
                    if not _is_str_list(value):
                        _add_err(errors, f"{s_path}.{key}", "must be an array of strings")
                    elif len(value) == 0:
                        _add_err(errors, f"{s_path}.{key}", "must not be empty")

            if "open_unknowns" in s:
                ou = s["open_unknowns"]
                if not _is_str_list(ou):
                    _add_err(errors, f"{s_path}.open_unknowns", "must be an array of strings when present")
    else:
        _add_err(errors, "$.slices", "must be an array")

    return (errors, warnings)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate an slicing-stories Slice Map JSON file.")
    parser.add_argument("path", help="Path to slice-map.json")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Enable stricter checks (timestamp format is an error).",
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

    errors, warnings = validate_slice_map(bundle, strict=args.strict)

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
