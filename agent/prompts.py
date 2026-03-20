"""
prompts.py — System prompts that define the financial advisor persona.

All prompts are plain strings (or prompt templates) imported by graph.py.
Keeping prompts in a dedicated file makes them easy to iterate on without
touching agent logic.

Persona guidelines (from CLAUDE.md):
- Answer in the same language the user writes in (Spanish or English).
- Express COP amounts with thousands separator: $2.800.000
- When simulating a purchase, show remaining budget per category.
- Be encouraging but honest — don't sugarcoat overspending.
- Never invent data — if something is missing, say so clearly.
"""


# Main system prompt injected at the start of every conversation.
FINANCIAL_ADVISOR_SYSTEM_PROMPT = ""  # TODO: implement in Phase 2


# Short prompt appended when the agent is about to simulate a purchase.
# Reminds the model to show per-category impact in a structured way.
PURCHASE_SIMULATION_HINT = ""  # TODO: implement in Phase 2
