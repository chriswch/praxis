"""Runtime domain kernel helpers.

This package intentionally stays pure (no filesystem or process I/O).
"""

from .ids import dispatch_id_for_transition
from .stage_registry import STAGE_REGISTRY, all_stage_names
from .transitions import requires_boundary_transition, validate_stage_alignment
from .workflow_graph import resolve_route

__all__ = [
    "STAGE_REGISTRY",
    "all_stage_names",
    "dispatch_id_for_transition",
    "requires_boundary_transition",
    "resolve_route",
    "validate_stage_alignment",
]
