"""
graph.py — LangGraph StateGraph definition for the financial advisor agent.

Architecture:
    The graph has two nodes:
      1. "agent"  — The LLM decides whether to answer directly or call a tool.
      2. "tools"  — Executes whichever tool the LLM requested, then loops back.

    Execution flow:
      START → agent → (if tool call) → tools → agent → ... → END

State:
    Uses AgentState (defined below), which carries the conversation messages
    and loaded financial context across all nodes.

Entry point:
    Call build_graph() to get a compiled LangGraph app ready for .invoke() or .stream().
"""

from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    Shared state passed between all nodes in the LangGraph graph.

    Attributes:
        messages: Full conversation history. The add_messages reducer
                  appends new messages rather than overwriting the list.
        financial_context: Pre-loaded Sheets data cached for the session.
                           Loaded once at the start to avoid repeated API calls.
        current_month: Current month in Spanish, e.g. "Marzo".
        current_year: Current year as an integer, e.g. 2025.
    """

    messages: Annotated[list, add_messages]
    financial_context: dict
    current_month: str
    current_year: int


def build_graph():
    """
    Construct and compile the LangGraph StateGraph.

    Binds the LLM (from llm_factory) with the available tools, defines
    the agent and tools nodes, and sets the conditional routing logic
    (loop back to agent after a tool call, or end if the LLM responds directly).

    Returns:
        A compiled LangGraph app (CompiledGraph) ready for .invoke() or .stream().
    """
    pass  # TODO: implement in Phase 2
