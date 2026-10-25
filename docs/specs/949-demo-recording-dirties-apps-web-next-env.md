# C-409: Demo recording dirties apps/web/next-env.d.ts and the Board opens a junk pull request

Issue: #949

## What happened (2026-10-25)
After C-388's PR #934 merged, a demo had just been recorded in its card worktree. `next dev`, started by `scripts/demo-dev.sh`, rewrote `apps/web/next-env.d.ts` (`./.next/types/...` → `./.next/dev/types/...`). The card's collect committed that file and the Board opened PR #948 with only this change. #948 was closed by hand. The same thing will happen after every demo of a web card.

## Fix
Keep demo recording from leaving tracked changes in the card worktree. Options, pick by evidence:
- Restore `apps/web/next-env.d.ts` (or every tracked file the demo touched) after the recording, in the runner's demo path.
- Or keep Next from writing it in demo/dev mode (check Next's `typedRoutes`/`next-env.d.ts` behaviour for the version in use), or keep the file stable for both `next dev` and `next build`.
- Collect must not open a new pull request for a card whose PR already merged when the only new diff comes from the demo or other generated files.

## Done when
- Recording a demo leaves `git status` clean in the card worktree (a test or a documented run).
- A card whose PR merged gets no follow-up PR from demo artefacts.
- `bun run check` and the affected tests pass.
