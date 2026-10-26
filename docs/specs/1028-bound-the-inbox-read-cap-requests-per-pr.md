# C-470: Bound the Inbox read: cap requests per project and read readiness in one batch

Issue: #1028

## Why
GET /inbox runs on every shell load and live event. It caps requests across all projects (one noisy project hides the rest) and reads readiness project by project.

## What
- One windowed query keeps ≤ 50 pending requests per project (ADR-0106 Consequences).
- ReadinessService.viewMany reads every busy project in one batch; view() uses it. No cache.

## Done when
- e2e: 60 requests in A and 1 in B list 50 + 1; non-members see none.
- viewMany issues a fixed number of queries and equals view() per id.
- InboxView unchanged.

Evidence: apps/api/src/inbox/inbox.service.ts:30,222-230,259-287; readiness.service.ts:38-74

Spec: docs/specs/card-470-bound-the-inbox-read.md
