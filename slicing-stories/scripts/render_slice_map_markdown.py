#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def _md_cell(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, list):
        value = ", ".join(str(item) for item in value if item is not None)
    text = str(value).replace("\n", " ").strip()
    return text.replace("|", "\\|") if text else "—"


def _require_object(bundle: Any) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        raise ValueError("top-level JSON must be an object")
    for key in ("meta", "slices"):
        if key not in bundle:
            raise ValueError(f"missing required top-level key: {key}")
    if not isinstance(bundle.get("meta"), dict):
        raise ValueError("'meta' must be an object")
    if not isinstance(bundle.get("slices"), list):
        raise ValueError("'slices' must be an array")
    return bundle


def _render_meta(lines: list[str], meta: dict[str, Any]) -> None:
    lines.append("## Meta")
    lines.append(f"- **Project:** {_md_cell(meta.get('project'))}")
    lines.append(f"- **Source:** {_md_cell(meta.get('source'))}")
    lines.append(f"- **Generated:** {_md_cell(meta.get('generated_at'))}")
    lines.append(f"- **Feature summary:** {_md_cell(meta.get('feature_summary'))}")

    assumptions = meta.get("assumptions") if isinstance(meta.get("assumptions"), list) else []
    lines.append("")
    lines.append("## Assumptions")
    if assumptions:
        for item in assumptions:
            lines.append(f"- {_md_cell(item)}")
    else:
        lines.append("- —")

    open_questions = meta.get("open_questions") if isinstance(meta.get("open_questions"), list) else []
    lines.append("")
    lines.append("## Open Questions")
    if open_questions:
        for q in open_questions:
            if not isinstance(q, dict):
                continue
            q_id = _md_cell(q.get("id"))
            blocking = "blocking" if q.get("blocking") else "deferrable"
            owner = _md_cell(q.get("owner"))
            question = _md_cell(q.get("question"))
            lines.append(f"- **{q_id}** ({blocking}, owner: {owner}): {question}")
    else:
        lines.append("- —")


def _render_summary_table(lines: list[str], slices: list[dict[str, Any]]) -> None:
    lines.append("")
    lines.append("## Slice Summary")
    lines.append("")
    lines.append("| # | ID | Title | Story |")
    lines.append("|---|---|---|---|")
    for idx, s in enumerate(slices):
        num = idx + 1
        s_id = _md_cell(s.get("id"))
        title = _md_cell(s.get("title"))
        story = _md_cell(s.get("story"))
        lines.append(f"| {num} | {s_id} | {title} | {story} |")


def _render_slice_details(lines: list[str], slices: list[dict[str, Any]]) -> None:
    lines.append("")
    lines.append("## Slice Details")

    for s in slices:
        if not isinstance(s, dict):
            continue
        lines.append("")
        lines.append(f"### {_md_cell(s.get('id'))}: {_md_cell(s.get('title'))}")
        lines.append("")
        lines.append(f"**Story:** {_md_cell(s.get('story'))}")

        scope_in = s.get("scope_in") if isinstance(s.get("scope_in"), list) else []
        lines.append("")
        lines.append("**In scope:**")
        if scope_in:
            for item in scope_in:
                lines.append(f"- {_md_cell(item)}")
        else:
            lines.append("- —")

        scope_out = s.get("scope_out") if isinstance(s.get("scope_out"), list) else []
        lines.append("")
        lines.append("**Out of scope:**")
        if scope_out:
            for item in scope_out:
                lines.append(f"- {_md_cell(item)}")
        else:
            lines.append("- —")

        lines.append("")
        lines.append(f"**Sequence rationale:** {_md_cell(s.get('sequence_rationale'))}")

        open_unknowns = s.get("open_unknowns") if isinstance(s.get("open_unknowns"), list) else []
        if open_unknowns:
            lines.append("")
            lines.append("**Open unknowns:**")
            for item in open_unknowns:
                lines.append(f"- {_md_cell(item)}")


def render_slice_map_markdown(bundle: dict[str, Any], *, include_json: bool) -> str:
    bundle = _require_object(bundle)
    meta = bundle["meta"]
    slices = bundle["slices"]

    project = meta.get("project") if isinstance(meta.get("project"), str) else "TBD"

    lines: list[str] = []
    lines.append(f"# Slice Map — {project}")
    lines.append("")
    _render_meta(lines, meta)
    slice_dicts = [s for s in slices if isinstance(s, dict)]
    _render_summary_table(lines, slice_dicts)
    _render_slice_details(lines, slice_dicts)

    if include_json:
        lines.append("")
        lines.append("## Slice Map (JSON)")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(bundle, indent=2, ensure_ascii=False))
        lines.append("```")

    return "\n".join(lines).rstrip() + "\n"


def _load_json_text(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Render an slicing-stories Slice Map JSON file as human-readable Markdown."
    )
    parser.add_argument("path", nargs="?", default="slice-map.json", help="Path to slice-map.json (or '-' for stdin)")
    parser.add_argument("--no-json", action="store_true", help="Do not embed the JSON at the end of the Markdown output")
    parser.add_argument("--validate", action="store_true", help="Validate the slice map before rendering")
    parser.add_argument("--strict", action="store_true", help="Use strict validation (timestamp format)")
    args = parser.parse_args(argv)

    try:
        raw = _load_json_text(args.path)
    except FileNotFoundError:
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 2
    except OSError as e:
        print(f"error: could not read {args.path}: {e}", file=sys.stderr)
        return 2

    try:
        bundle = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON: {e}", file=sys.stderr)
        return 2

    if args.validate:
        try:
            from validate_slice_map import validate_slice_map  # type: ignore
        except Exception as e:  # pragma: no cover
            print(f"error: could not import validator: {e}", file=sys.stderr)
            return 2
        errors, warnings = validate_slice_map(bundle, strict=args.strict)
        for w in warnings:
            print(f"warning: {w}", file=sys.stderr)
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        if errors:
            return 1

    try:
        md = render_slice_map_markdown(bundle, include_json=not args.no_json)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
