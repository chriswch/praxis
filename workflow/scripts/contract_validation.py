from __future__ import annotations

import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any


_CONTRACTS_DIR = Path(__file__).resolve().parent.parent / "contracts"


class ContractValidationError(ValueError):
    """Raised when a payload fails one of Praxis's JSON contracts."""


@lru_cache(maxsize=None)
def load_contract_schema(name: str) -> dict[str, Any]:
    return json.loads((_CONTRACTS_DIR / name).read_text())


def validate_contract_payload(name: str, payload: Any) -> None:
    schema = load_contract_schema(name)
    _validate(payload, schema, root_schema=schema, path="$")


def _validate(instance: Any, schema: dict[str, Any], *, root_schema: dict[str, Any], path: str) -> None:
    if "$ref" in schema:
        resolved = _resolve_ref(root_schema, schema["$ref"])
        _validate(instance, resolved, root_schema=root_schema, path=path)
        return

    if "anyOf" in schema:
        errors: list[str] = []
        for option in schema["anyOf"]:
            try:
                _validate(instance, option, root_schema=root_schema, path=path)
                break
            except ContractValidationError as exc:
                errors.append(str(exc))
        else:
            raise ContractValidationError(
                f"{path}: value did not satisfy any allowed schema option ({'; '.join(errors)})."
            )

    if "allOf" in schema:
        for branch in schema["allOf"]:
            if "if" in branch:
                if _matches(instance, branch["if"], root_schema=root_schema, path=path):
                    then_branch = branch.get("then")
                    if then_branch is not None:
                        _validate(instance, then_branch, root_schema=root_schema, path=path)
                continue
            _validate(instance, branch, root_schema=root_schema, path=path)

    expected_type = schema.get("type")
    if expected_type is not None:
        _validate_type(instance, expected_type, path)

    if "const" in schema and instance != schema["const"]:
        raise ContractValidationError(f"{path}: expected constant {schema['const']!r}, got {instance!r}.")

    if "enum" in schema and instance not in schema["enum"]:
        raise ContractValidationError(f"{path}: expected one of {schema['enum']!r}, got {instance!r}.")

    if isinstance(instance, str):
        min_length = schema.get("minLength")
        if min_length is not None and len(instance) < min_length:
            raise ContractValidationError(f"{path}: expected string length >= {min_length}, got {len(instance)}.")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, instance) is None:
            raise ContractValidationError(f"{path}: string {instance!r} does not match pattern {pattern!r}.")
        if schema.get("format") == "date-time":
            _validate_datetime(instance, path)

    if isinstance(instance, list):
        items_schema = schema.get("items")
        if items_schema is not None:
            for index, item in enumerate(instance):
                _validate(item, items_schema, root_schema=root_schema, path=f"{path}[{index}]")
        if schema.get("uniqueItems"):
            seen: list[Any] = []
            for item in instance:
                if item in seen:
                    raise ContractValidationError(f"{path}: duplicate list item {item!r} is not allowed.")
                seen.append(item)

    if isinstance(instance, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                raise ContractValidationError(f"{path}: missing required property {key!r}.")

        properties = schema.get("properties", {})
        additional_properties = schema.get("additionalProperties", True)
        for key, value in instance.items():
            if key in properties:
                _validate(value, properties[key], root_schema=root_schema, path=f"{path}.{key}")
                continue
            if additional_properties is False:
                raise ContractValidationError(f"{path}: unexpected property {key!r}.")
            if isinstance(additional_properties, dict):
                _validate(value, additional_properties, root_schema=root_schema, path=f"{path}.{key}")


def _matches(instance: Any, schema: dict[str, Any], *, root_schema: dict[str, Any], path: str) -> bool:
    try:
        _validate(instance, schema, root_schema=root_schema, path=path)
    except ContractValidationError:
        return False
    return True


def _resolve_ref(root_schema: dict[str, Any], ref: str) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ContractValidationError(f"Unsupported contract reference {ref!r}.")

    node: Any = root_schema
    for part in ref[2:].split("/"):
        if not isinstance(node, dict) or part not in node:
            raise ContractValidationError(f"Broken contract reference {ref!r}.")
        node = node[part]

    if not isinstance(node, dict):
        raise ContractValidationError(f"Contract reference {ref!r} did not resolve to an object schema.")
    return node


def _validate_type(instance: Any, expected_type: str, path: str) -> None:
    checks = {
        "object": lambda value: isinstance(value, dict),
        "array": lambda value: isinstance(value, list),
        "string": lambda value: isinstance(value, str),
        "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
        "number": lambda value: (isinstance(value, int) or isinstance(value, float)) and not isinstance(value, bool),
        "boolean": lambda value: isinstance(value, bool),
        "null": lambda value: value is None,
    }
    checker = checks.get(expected_type)
    if checker is None:
        raise ContractValidationError(f"Unsupported contract type {expected_type!r}.")
    if not checker(instance):
        raise ContractValidationError(
            f"{path}: expected {expected_type}, got {type(instance).__name__}."
        )


def _validate_datetime(value: str, path: str) -> None:
    candidate = value.replace("Z", "+00:00")
    try:
        datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise ContractValidationError(f"{path}: invalid date-time value {value!r}.") from exc
