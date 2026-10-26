# C-474: Overview stops calling approvals once per project on every live event

Stack **S-20**, stage 0.

## Summary
Overview fetches `GET /projects/:id/approvals` for every project on load. It fetches them all again on every `fleet` or `approvals` push. Nothing on the page shows the result: what waits on the person comes from the Inbox (C-390). The approvals only decide whether a project is marked "not answering". This card removes the calls.

## Scope
**In:** `apps/web/src/components/overview/use-dashboard.ts` and `apps/web/src/lib/overview/dashboard.ts`.
**Out:** the approvals API, and the Queue › Approvals tab.

## Current behaviour
- [Confirmed] `use-dashboard.ts:55-91`: `loadProjectFacts` makes one `/fleet` call and then, per project, `api<ApprovalsView>(/projects/:id/approvals)`. A failed approvals call puts the project in `failed`.
- [Confirmed] `use-dashboard.ts:28-29,152`: `FACTS_EVENTS = [FLEET_LIVE_EVENT, APPROVALS_LIVE_EVENT]` reload all of it.
- [Confirmed] `facts.approvals` is read nowhere in `apps/web/src/components` (grep). `approvalsHref` (`lib/overview/dashboard.ts:124-137`) is used only by its own test.

## Decisions
- Remove the approvals from `ProjectFacts`, `loadProjectFacts` and `FACTS_EVENTS`. Delete `approvalsHref` and its test. The Inbox already answers what waits (ADR-0106 Consequences: "One request per shell load and per live event replaces Overview's per-project fan-out").
- `failed` then means "its fleet did not answer". The copy beside the figures stays as it is.

## Acceptance criteria
- [ ] Overview makes no `/projects/:id/approvals` request on load or on a live event. A Playwright check or the demo's network log asserts it.
- [ ] `lib/overview/dashboard.test.ts` no longer covers `approvalsHref`, and the remaining tests pass.
- [ ] A project whose fleet is missing from `/fleet` is still listed as not answering.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-overview-without-approvals-fan-out.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows Overview loading its sections.

## Risks
- None. The data was never shown.

## Open questions
- None.
