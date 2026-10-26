# C-426: Mark a card whose PR head lags behind the pushed commit

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 2. Part of the 2026-10-26 improvement plan.

## Summary
When GitHub keeps showing the old head after a round's push, the API waits up to 30 minutes without a word on the
card (ADR-0086 Consequences: "Nothing marks the card during that wait"). The person sees a card stuck In progress
with green or stale CI. After a short wait the card now says why.

## Current state
- [Confirmed] `prHeadBehind` (`apps/api/src/board/board-shipping.ts:112-126`) and its use (`:578-587`): the check
  logs and returns, and nothing is stored. `CARD_PR_HEAD_LAG_MS` is 30 min (`packages/shared/src/board/types.ts:214`).
- [Confirmed] So `ciHeadSha` keeps the head read before the round, which is the round's `startHeadSha`.

## Decisions
- Derived, not stored: the card view gets `prHeadLag` when the latest round is over, its `headSha` differs from
  `ciHeadSha`, `startHeadSha === ciHeadSha`, and the round ended at least `CARD_PR_HEAD_LAG_NOTICE_MS` (5 min) ago
  (the person, 2026-10-26 interview). No change to board-shipping and no needs-person flag: it clears itself when
  GitHub catches up.
- ADR-0086 Consequences get a one-line amendment linking this spec; no new ADR.

## Data / API
- `CARD_PR_HEAD_LAG_NOTICE_MS = 5 * 60_000` in `types.ts`.
- `BoardCardView.prHeadLag: {pushed: string; shown: string; since: string; judged: boolean} | null` in
  `packages/shared/src/board/contracts.ts`; computed in `apps/api/src/board/board-mapper.ts`. `judged` is true past
  `CARD_PR_HEAD_LAG_MS`.

## UI
- Card face (`card-face.tsx` through `apps/web/src/lib/board/shipping.ts`): a warn signal "GitHub still shows the old
  head". The sheet adds both short heads and, when `judged`, "judged as GitHub shows it". glass-ui only.

## Acceptance criteria
- [ ] Unit (`board-mapper.spec.ts`): the view has `prHeadLag` at 6 min, not at 4 min, and not when `ciHeadSha` equals
      the pushed head.
- [ ] Web test: the face shows the signal; the sheet shows both heads.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-mark-a-card-whose-pr-head-lags.demo.json` (sign-in fragment in `setup`).

## Open questions
- Notify on lag? Default: no.
