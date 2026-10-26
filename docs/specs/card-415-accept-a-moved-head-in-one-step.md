# C-415: Accept a card whose head moved in one step

Stack **S-17 "Card flow: rounds, accept and shipping"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
Accept merges only the head the person saw (#273 D13). When the PR moved on, the refusal says only "review it again":
the person reopens the dialog, and a client of the API has to read `headRefOid` from GitHub by hand. The orchestrator
did this for every accept. A refusal now carries the current head, and the web and Telegram offer "review the new
head and accept" in place.

## Current state
- [Confirmed] `AcceptMergeDto.headSha` is required for a merge (`apps/api/src/board/dto.ts:416-420`).
- [Confirmed] `BoardWork.mergePr` throws `merge_failed` with `{reason}` only (`apps/api/src/board/board-work.ts:776-792`);
  the runner's message names the new head in prose (`apps/runner/src/cards/merge.ts:141-146`).
- [Confirmed] Web: `describeMergeFailure('head_changed')` → "The branch changed since you opened this — review it
  again." (`apps/web/src/lib/board/format.ts:373-374`).
- [Confirmed] Telegram already reads the PR, then answers `HEAD_MOVED_TEXT` "Tap Accept again"
  (`apps/api/src/telegram/telegram-card.service.ts:294-306`, `card-actions.ts:337-338`).

## Decisions
- The refusal names the new head; the person still sees it before the merge. No silent merge of an unseen head (the
  person, 2026-10-26 interview; #273 D13 stands).

## API
- `mergePr`, on `reason: 'head_changed'`: read the PR (`BoardService.pullRequest` path, `card.checks` or
  `pr.inspect`) and add `headSha` (40 hex) and `diffUrl` to the 409 body. A failed read leaves them out.
- No DTO change.

## UI
- `apps/web/src/components/board/accept-dialog.tsx`: on `head_changed` with `headSha`, the dialog stays open and shows
  a glass-ui `Banner` (warn): "New commits since you opened this: <sha7> — view changes", then the primary button
  "Accept <sha7>", which resubmits with the new head. Without `headSha` it behaves as today.
- Telegram (`telegram-card.service.ts`): on a moved head, the edited message shows the new short head and diff link,
  with a fresh Accept-and-merge button bound to it.

## Acceptance criteria
- [ ] e2e (`apps/api/src/board/board-accept*.e2e.spec.ts`): an accept with a stale head gets 409 `merge_failed` with
      `reason: head_changed` and the current `headSha`.
- [ ] Web test (`accept-dialog.test.tsx`): the refusal shows the banner; "Accept <sha7>" posts the new head.
- [ ] Telegram e2e: a moved head returns a message with the new head and a working Accept button; the old button stays
      refused.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-accept-a-moved-head-in-one-step.demo.json` (signs in through
      `demoflow/fragments/sign-in.json` in `setup`) shows the refusal and the one-step accept.

## Risks
- The head can move again between the two clicks; the same refusal repeats, which is correct.

## Open questions
- None.
