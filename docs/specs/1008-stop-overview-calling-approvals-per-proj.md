# C-474: Stop Overview calling approvals per project on every live event

Issue: #1008

## Why
Overview fetches /projects/:id/approvals for every project on load and on every fleet/approvals push, but shows none of it; the Inbox answers what waits.

## What
- Drop approvals from ProjectFacts, the loader and FACTS_EVENTS; delete the unused approvalsHref.

## Done when
- No approvals request from Overview.
- A project with no fleet still reads as not answering.
- DemoFlow demo recorded.

Evidence: apps/web/src/components/overview/use-dashboard.ts:55-91,152; lib/overview/dashboard.ts:124-137

Spec: docs/specs/card-474-overview-drops-approvals-fan-out.md
