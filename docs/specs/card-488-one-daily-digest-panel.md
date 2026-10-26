# C-488: Workspace Activity shows one daily digest panel, read in one call

Stack **S-20**, stage 1: after C-475, which changes how Activity follows live topics.

## Summary
Workspace Activity stacks two digest panels, the AI digest and the Steward digest. Each fetches the latest digest of **every** project one by one, and the Steward one also polls every 5 minutes. For a person they are one thing, "what happened yesterday". This card shows them as one panel with a tab per digest kind, fed by one API call. It refreshes when a digest lands instead of on a timer.

## Scope
**In:** a workspace read of the latest digests; one panel on `/activity`; removing the two old panels from that page.
**Out:** how digests are made, Telegram delivery, digest settings, and the project-level Activity page.

## Current behaviour
- [Confirmed] `apps/web/src/app/(app)/activity/page.tsx:20-21` renders `<AiDigestPanel>` and `<DigestPanel>` one after the other.
- [Confirmed] `apps/web/src/components/ai/digest-panel.tsx:25-40`: `Promise.allSettled` of `fetchLatestAiDigest(project.id)` per project, which is `GET /projects/:id/ai/digest/latest` (`apps/web/src/lib/ai/actions.ts:31`).
- [Confirmed] `apps/web/src/components/steward/digest-panel.tsx:26,35-45,148-153`: the same per project for `GET /projects/:id/steward/digest/latest`, plus `setInterval(retry, 300_000)`.
- [Confirmed] A sent AI digest is an `ai_digest.sent` event shown in the feed (`packages/shared/src/ai/contracts.ts:94-97`). The steward digest's prose run publishes `run.updated` on `project:<id>` (`apps/api/src/steward-digest/steward-digest-prose.ts:206`).
- [Unknown] whether a finished steward digest writes an activity item. The card checks this and records the answer in the PR.

## API
`GET /digests/latest` (signed in) → `{ items: { projectId, projectName, ai: AiDigestView | null, steward: StewardDigestView | null }[] }`. The list holds the projects the caller is a member of (every project for an admin) that have at least one digest. Each digest is mapped by the existing mappers. The read runs one query per digest kind across those projects (the latest per project via `DISTINCT ON`), never one per project.

## Decisions
- **One panel, two tabs** (glass-ui `Tabs`): **Summary** (the AI digest) and **Steward**. A tab with no digest in any project is not shown, and the panel is hidden when both are empty. The person, 2026-10-26 interview: one place per thing.
- **No timer.** The panel reloads when the feed's live handler sees an `activity.item` of a digest type, on its own `project:` topics (C-475), and when the window regains focus.
- The two old panel components go if nothing else renders them. [Confirmed] only `activity/page.tsx` imports them.

## Acceptance criteria
- [ ] `digests.e2e.spec.ts`: a member of 2 of 3 projects gets exactly those 2 projects' latest AI and Steward digests. A non-member's project never appears (authorization).
- [ ] The e2e shows the read issues a fixed number of queries whatever the project count, with a Prisma query counter or a `$on('query')` spy.
- [ ] The Activity page makes one `/digests/latest` call on load and no call on a 5-minute timer.
- [ ] A new `ai_digest.sent` item makes the panel reload.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-one-daily-digest-panel.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then opens Activity and switches between the Summary and Steward tabs.

## Risks
- A steward digest that writes no activity item reloads the panel only on focus. That is acceptable for a daily digest, and the open question below covers it.

## Open questions
- Should a finished steward digest write an activity item, so the panel follows it live? Default: yes if it is one line in `steward-digest`. Otherwise focus-only is enough.
