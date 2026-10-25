# C-391: Quick card next to the New work interview: text → To Do, optional run

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Creating and running a card takes about 7 clicks plus an LLM interview (`NewCardDialog` always runs the intake).

## What
- In New work, a **Quick card** action beside the interview (the interview stays the default for big work and stacks).
- One text field plus attachments. A cheap model fills the title and kind (feature/bug), editable before saving. A checkbox **Run now** puts the card into the run queue (fleet stack) or starts it if a slot is free.
- Also from ⌘K and the phone `+` button.

## Done when
Type → Enter creates a card in To Do in one step, and with Run now it runs or queues.

Spec: docs/specs/card-391-quick-card-next-to-the-new-work-intervie.md (PR #937)
