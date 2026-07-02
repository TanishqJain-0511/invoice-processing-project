"""
LangGraph pipeline graph definition.

Topology:
  extract → validate → [conditional] → match → decide → END
                              │
                              └── (can_proceed_to_matching=False) → decide → END

build_pipeline() returns a compiled LangGraph app that accepts a PipelineState
dict and returns the final PipelineState with all fields populated.
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from pipeline.nodes.decision import decision_node
from pipeline.nodes.extraction import extraction_node
from pipeline.nodes.matching import matching_node
from pipeline.nodes.validation import validation_node
from pipeline.state import PipelineState


def build_pipeline():
    """Build and compile the four-stage invoice processing pipeline."""
    graph = StateGraph(PipelineState)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node("extract", extraction_node)
    graph.add_node("validate", validation_node)
    graph.add_node("match", matching_node)
    graph.add_node("decide", decision_node)

    # ── Entry point ───────────────────────────────────────────────────────────
    graph.set_entry_point("extract")

    # ── Edges ─────────────────────────────────────────────────────────────────
    graph.add_edge("extract", "validate")

    graph.add_conditional_edges(
        "validate",
        _route_after_validation,
        {"match": "match", "decide": "decide"},
    )

    graph.add_edge("match", "decide")
    graph.add_edge("decide", END)

    return graph.compile()


def _route_after_validation(state: PipelineState) -> str:
    """
    After Stage 2 validation: proceed to matching if we have enough data,
    otherwise skip directly to Stage 4 decision.

    can_proceed_to_matching=False when both vendor_name and total are missing —
    there is nothing to match against.
    """
    if state.get("can_proceed_to_matching", True):
        return "match"
    return "decide"
