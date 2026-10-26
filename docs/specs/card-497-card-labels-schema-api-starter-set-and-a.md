# C-497: Card labels: schema, API, starter set and ADR-0125

## Why
Cards cannot be grouped: `kind` is only feature or bug. The person wants coloured labels per project, set by hand and automatically, with a person's choice always winning.

## What
- `ProjectLabel` (name, glass-ui hue 1–8, position, combines), `ProjectLabelPathRule`, `BoardCardLabel` (source person/model/paths, removed); migration 20261231000051 with the starter set for every project and the `card_labels` LLM feature.
- Starter set: frontend, backend, fullstack, redesign, infra, docs, with default path rules and fullstack = frontend + backend.
- REST: project labels and rules (admin), `PUT board/cards/:n/labels` (operator), `labelIds` on create, `labels` on every card view.
- `BoardLabels.applyAuto` — the one way automation writes labels, never touching a person's — and a suggester ref for the model card.
- ADR-0125.

## Done when
- Every project has the starter set; admin-only config and cross-project access are covered by e2e.
- `applyAuto` unit tests prove a person's label is never changed or re-added.
- `GET board` returns labels without N+1.

Evidence: apps/api/prisma/schema.prisma:3418-3436; apps/api/src/board/board.service.ts:546-633

Spec: docs/specs/card-497-card-labels-schema-api-and-starter-set.md
