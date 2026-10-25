# C-359: Store and return each round's model and effort

## What to do
C-332 (#872, PR #873) added optional `model` and `effort` to `CardRoundView` in `packages/shared` and renders them in the round facts, but `BoardCardRound` in `apps/api/prisma/schema.prisma` stores neither, so the API never fills them and the UI hides them. Record the model and effort a round was launched with (from the Run request / launch command the runner reports) on `BoardCardRound` through a `prisma migrate dev` migration with a descriptive name, and return them in card detail.

## Acceptance criteria
- [ ] A round started with an explicit model/effort returns them in `GET` card detail; a round with defaults returns the resolved values the runner launched with.
- [ ] Rounds recorded before the migration return null without errors.
- [ ] The round item in the Rounds tab shows model and effort (already wired by #873) with no web change beyond fixtures.
- [ ] API specs (`*.spec.ts`) cover recording and returning both fields.
- [ ] `bun run check` passes.

## Out of scope
- Backfilling old rounds.
- Changing how model/effort are chosen.
