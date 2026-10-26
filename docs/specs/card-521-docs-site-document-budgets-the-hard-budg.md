# C-521: Docs site: document budgets, the hard-budget pause and the run queue

## Why
The two limits an operator meets first — spend and how many cards run at once — are undocumented. A hard budget now pauses running card rounds (ADR-0101) and Run at the agent limit queues the card (ADR-0102); both surprise people who have not read the ADRs.

## What
- One page under Using Nautelle: budget scopes, alert vs stop, periods; what a reached hard budget pauses and what it does not, resume and override; the Board's running limit, the queue, its order and what is still refused.

## Done when
- Docs build passes; every rule matches ADR-0101/0102; setting names match the UI. No demo.

Evidence: ADR-0101, ADR-0102; apps/web/src/app/(app)/projects/[projectId]/settings/board-tab.tsx:68-99

Spec: docs/specs/card-521-docs-site-budgets-and-run-queue.md
