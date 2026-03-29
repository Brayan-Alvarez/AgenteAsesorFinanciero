"""
graph.py — LangGraph StateGraph for the financial advisor agent.

Architecture (ReAct loop):
    START → agent_node
               │
               ├─ (tool_calls present) → tools_node → agent_node → ...
               │
               └─ (no tool_calls)      → END

Nodes:
    agent_node  — Calls the LLM with the current conversation + system prompt.
                  The LLM decides whether to reply directly or invoke a tool.
    tools_node  — Runs the requested tool(s) via ToolNode and appends the
                  results as ToolMessages so the LLM can read them next turn.

State:
    AgentState carries the full conversation history, the pre-loaded financial
    context, and the current month/year used to fill the system prompt.

Entry point for callers:
    from agent.graph import run_agent
    reply = run_agent("¿Cómo vamos con el presupuesto?")
"""

import logging
from datetime import datetime
from typing import Annotated, Literal, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from agent.llm_factory import get_llm
from agent.prompts import FINANCIAL_ADVISOR_SYSTEM_PROMPT
from agent.tools import TOOLS
from data.sheets_loader import SPANISH_MONTHS

load_dotenv()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State definition (matches CLAUDE.md spec exactly)
# ---------------------------------------------------------------------------

class AgentState(TypedDict):
    """
    Shared state passed between all nodes in the LangGraph graph.

    Attributes:
        messages:           Full conversation history. The add_messages reducer
                            appends new messages instead of overwriting.
        financial_context:  Pre-loaded Sheets data cached for the session.
                            Loaded once at graph initialisation.
        current_month:      Current month in Spanish, e.g. "Marzo".
        current_year:       Current year as an integer, e.g. 2026.
    """

    messages: Annotated[list, add_messages]
    financial_context: dict
    current_month: str
    current_year: int


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def agent_node(state: AgentState) -> dict:
    """
    Call the LLM with the current conversation history.

    Prepends a SystemMessage whose content is the financial advisor persona
    prompt with {current_month} and {current_year} filled from state.

    Returns a partial state update: only the new AI message is added;
    the add_messages reducer appends it to the existing list.
    """
    system_content = FINANCIAL_ADVISOR_SYSTEM_PROMPT.format(
        current_month=state["current_month"],
        current_year=state["current_year"],
    )
    messages_with_system = [SystemMessage(content=system_content)] + state["messages"]

    response = llm_with_tools.invoke(messages_with_system)
    logger.debug("agent_node response: %s", response)

    return {"messages": [response]}


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """
    Routing function: loop to tools_node if the LLM made tool calls,
    otherwise finish.

    LangGraph calls this after every agent_node execution to decide the
    next step.  The last message in state["messages"] is always the most
    recent AIMessage produced by agent_node.
    """
    last_message = state["messages"][-1]

    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    return END


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_graph():
    """
    Construct and compile the LangGraph StateGraph.

    Wires together agent_node (LLM) and tools_node (tool executor) with
    conditional routing so the agent loops until it has a final answer.

    Returns:
        A compiled LangGraph app ready for .invoke() or .stream().
    """
    graph = StateGraph(AgentState)

    # Register nodes.
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(TOOLS))

    # Entry point: always start at the agent node.
    graph.add_edge(START, "agent")

    # After agent_node: route to tools or finish.
    graph.add_conditional_edges("agent", should_continue)

    # After tools_node: always loop back to the agent so it can
    # read the tool result and decide what to do next.
    graph.add_edge("tools", "agent")

    return graph.compile()


# ---------------------------------------------------------------------------
# Module-level singletons — built once when the module is first imported
# ---------------------------------------------------------------------------

# LLM with all tools bound so it can emit tool_call messages.
llm_with_tools = get_llm().bind_tools(TOOLS)

# Compiled graph reused across all run_agent() calls.
_graph = build_graph()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_agent(user_message: str) -> str:
    """
    Run a single conversation turn through the financial advisor agent.

    Builds a fresh initial state for each call (stateless between calls —
    conversation history is not persisted across separate run_agent calls).
    The Sheets data is served from the cache layer so repeated calls within
    a session do not trigger extra API requests.

    Args:
        user_message: The user's question or request as a plain string.

    Returns:
        The agent's final text response as a string.
    """
    # Determine current month and year from the system clock.
    now = datetime.now()
    current_month = SPANISH_MONTHS[now.month - 1]   # 0-indexed list
    current_year  = now.year

    initial_state: AgentState = {
        "messages":           [HumanMessage(content=user_message)],
        "financial_context":  {},   # reserved for future use by nodes / tools
        "current_month":      current_month,
        "current_year":       current_year,
    }

    logger.info("run_agent called: month=%s year=%d", current_month, current_year)

    final_state = _graph.invoke(initial_state)

    # The last message in the final state is always the agent's reply.
    return final_state["messages"][-1].content


# ---------------------------------------------------------------------------
# Quick smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    response = run_agent("¿Cómo vamos con el presupuesto este mes?")
    print(response)
