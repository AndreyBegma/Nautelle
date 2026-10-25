# C-389: A card whose pull request merged moves to Completed by itself, and stale Needs-you items clear themselves

Stack **S-13 "Core 1 — Speed and reliability"**, stage *Speed* (with C-364 and C-388).
This is part of the core plan of 2026-10-25, settled with the person in a grilling session.

## Why
- Finished holds merged cards until someone presses Accept. On 2026-10-24 there were 19 of them.
  Finished no longer means "waits for your review".
- The Overview "Needs you" list (`apps/web/src/components/overview/needs-you.tsx`) shows stale items:
  - slot items 5 days old, for slots that are gone;
  - steward digest failures.

## Decisions (grilling session)
- "Merged → Completed by itself." The merge is the person's decision, whether a person makes it on GitHub, through
  Accept, or through auto-merge under the project's policy.
- Finished keeps only work that waits for review.
- Needs-you and Inbox items hold only what waits on a decision. Service failures go to Activity.

## What
1. **Auto-completion.**
   - When a card's PR is merged, the card moves to Completed. This covers a merge on GitHub, a merge through Accept
     and an auto-merge.
   - The move is recorded in the card's history and the audit log, as merged by `<who>`.
   - Accept stays for the no-merge cases: close without merging, and terminal or fleet work without a PR.
2. **Migration.** One-time: merged cards in Finished move to Completed.
3. **Needs-you items resolve themselves** when they no longer apply:
   - the slot or session is gone;
   - the PR closed or merged;
   - the question was answered;
   - the action request expired.
4. **Service failures move out.** Steward digest and AI digest failures go to Activity, not to Needs you.

## Out of scope
- The Inbox page itself (C-390). This card makes the underlying list correct.

## Touched areas
- `apps/api/src/board/board-shipping.ts` (sees the merge through the checks poll)
- `apps/api/src/board/board.service.ts` (the column move)
- `apps/api/src/steward-digest/steward-digest-composer.ts`, `apps/api/src/notifications/event-mapping.ts` (where items are made)
- `apps/web/src/components/overview/needs-you.tsx`
- `apps/api/prisma/schema.prisma` and a migration, only if a new field is needed (`prisma migrate dev`)

## ADRs to read
- ADR-0035 (a card ships itself) and ADR-0084 (review steps before Finished): what Finished means today.
- ADR-0080 (auto-merge needs every check passed) and ADR-0086 (the PR head is read-only once GitHub shows it).
- **A new ADR is needed**: a merged card completes without Accept. It amends "only a person completes a card".
  Take the next free number from origin/develop at implementation time.

## Acceptance criteria
- [ ] Merging a card's PR on GitHub moves it to Completed within one checks poll.
- [ ] Auto-merge and Accept-with-merge end in Completed.
- [ ] After the migration, Finished holds only unmerged cards.
- [ ] No Needs-you item remains whose subject is gone (slot, session, PR, question, request).
- [ ] Steward and AI digest failures show in Activity and not in Needs you.

## Tests
- e2e for each auto-completion path: GitHub merge, auto-merge, Accept with merge.
- e2e for each self-resolving Needs-you kind.
- A test for the migration.

## Open questions
- None. A stacked card whose dependency merges first is retargeted by the existing PR poll (ADR-0064). Check that it
  completes only after its own PR merges.
