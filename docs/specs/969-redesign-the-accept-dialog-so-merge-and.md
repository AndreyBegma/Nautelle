# C-380: Redesign the Accept dialog so merge and no-merge options don't mix

Issue: #969

## What to do
The Accept dialog on the Board (`apps/web/src/components/board/accept-dialog.tsx`) confuses people. It shows options for two different paths at once:
- a "Delete the branch on GitHub" checkbox, which only applies to **Merge pull request**;
- a "Leave the PR open / Close the PR and delete its branch" radio group, which only applies to **Accept without merging**.

These controls sit next to each other above two equal-weight buttons. The branch deletion is offered twice, and nothing on screen says which button each control belongs to.

Rebuild the dialog so the person first picks what Accept should do, then sees only that path's options:
1. When the PR can be merged (`choice.kind === 'merge'`), show an action selector at the top with "Merge pull request" (default) and "Accept without merging".
2. Below it, show only the selected path's options:
   - Merge: the delete-branch checkbox.
   - Without merging: leave the PR open / close the PR, its delete-branch behaviour, and "Close the issue as not planned".
3. The footer has Cancel and **one** primary button. Its label follows the selection, e.g. "Merge pull request" / "Accept" / "Close pull request and accept", with the busy labels kept.
4. When only one path exists (`already_merged`, `accept_only`, fleet card, unreadable PR), don't show the selector. Show that path's content as today.

Also:
- Remove the duplicated copy. The dialog description and the "The pull request is merged through the runner…" paragraph say the same thing; keep one short sentence for each path.
- Make the PR block (`PullRequestBlock`) more informative. Show the card title or PR title if available, the head branch → base branch (from the card's `branch` and target-branch fields in `BoardCardView`), checks, the merge method, and conflicts as a visible warning instead of the " · has conflicts" suffix.

Keep the request-building logic in `apps/web/src/lib/board/accept.ts` (`mergeRequest`, `noMergeRequest`, `deleteBranchControl`, `branchCleanupGate`, `defaultAcceptOptions`) as the source of truth. Only add what the new selector needs. Use only glass-ui components (ADR-0011). If a segmented control or similar is missing, add it to glass-ui rather than writing it here. The unlanded-confirmation state (#709, `UnlandedBanner` / "Accept anyway") stays as it is.

## Acceptance criteria
- [ ] On a card with an open, mergeable PR, the dialog shows an action selector defaulting to "Merge pull request", with only the delete-branch checkbox below it.
- [ ] Switching to "Accept without merging" hides the merge checkbox and shows only the leave-open / close-PR choice. "Close the issue as not planned" appears only when close is picked and the card has an issue.
- [ ] Branch deletion is never offered by two controls at the same time.
- [ ] The footer has exactly one primary action button besides Cancel, and its label matches the selected path and options.
- [ ] The requests sent are unchanged: merge → `mergeRequest(...)`, no merge → `noMergeRequest(...)`, already merged → `{ merge: { headSha } }`.
- [ ] With `already_merged`, `accept_only`, a fleet card or an unreadable PR, no selector is shown and the existing banner explains the single path.
- [ ] Terminal cards still keep their branch: the delete-branch control stays disabled with its hint, and the close option reads "Close the PR".
- [ ] With a runner gate of `outdated` / `disabled`, branch and close controls show the `BRANCH_CLEANUP_HINT` text as today.
- [ ] Duplicated description text is removed; each path has one short explanation.
- [ ] The PR block shows the PR number link, the title, `head → base`, the checks pill and the merge method, and shows conflicts as a visible warning.
- [ ] `accept-dialog.test.tsx`, `accept.test.ts` and `accept-cleanup.test.ts` are updated and pass. New tests cover selector switching and the single primary button. `bun run check` passes.

## Out of scope
- Changing the defaults from #329 D7/D8: delete the branch after a merge (except terminal cards), and leave the PR open when accepting without merging.
- Any API, runner or shared-contract change (`AcceptBoardCardRequest`, `CardPullRequestView`).
- The Accept candidates dialog (`accept-candidates-dialog.tsx`) and the unlanded-confirmation flow.
- Fleet-card merge behaviour; the orchestrator still merges those.

## Open questions
- Which layout separates the two paths? Default: an action selector at the top (Merge / Accept without merging), only the selected path's options below it, and one primary button.
- Where does the PR title come from, since `CardPullRequestView` has none? Default: the card's title; no API change.
