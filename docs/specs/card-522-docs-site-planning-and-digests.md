# C-522: Docs site — New work, the Planner and digests

Stack **S-21 "Docs match the product"**, stage 1 (after C-515). Part of the 2026-10-26 improvement plan.

## Summary
The way work enters Nautelle (New work, the Planner interview, cards from incoming issues) and the two daily
digests are undocumented on the site. Write one page.

## Scope
**In:** `apps/docs/src/content/docs/using/planning-and-digests.md` (frontmatter `sidebar.order: 5`).
**Out:** the sidebar config, `concepts/board.md` and `concepts/stacks.md` (link them, do not edit), app code.

## Current state
- [Confirmed] Every "new" entry point (Fleet, Queue, project page, ⌘K) opens the Board's **New work** dialog
  (`?newWork=1`); a GitHub issue in the Queue becomes a To Do card through "Make a card"; the web New issue dialog
  is retired (ADR-0098 §2–3; `docs/ui/screens.md:49`, `:65-66`).
- [Confirmed] The Planner turns a brief into cards through an interview and lives on the Board (ADR-0034, ADR-0019);
  plans are at `apps/web/src/app/(app)/projects/[projectId]/planner/`; plan tasks also appear in Work with source
  Plan (`apps/web/src/lib/work/format.ts:46-51`); `/tasks` redirects there
  (`apps/web/src/app/(app)/tasks/page.tsx:4`). Designs are reviewed before a card runs (ADR-0022).
- [Confirmed] Two digests: the Steward's daily digest of stuck work, in Activity and Telegram (ADR-0040; C-406
  wired the panel), and the AI digest set in Settings › Planning › AI digest — on/off, time, time zone (ADR-0066;
  `apps/web/src/app/(app)/projects/[projectId]/settings/ai-digest-tab.tsx:33`).

## What
Sections: **Adding work** (quick card vs New work; from an issue) · **The Planner** (brief → interview → cards,
designs) · **Digests** (Steward digest vs AI digest, where each shows, how to turn each on).

## Acceptance criteria
- [ ] `bun run --cwd apps/docs build` passes; the page is fifth under **Using Nautelle**.
- [ ] No sentence says the web creates a GitHub issue; entry points match ADR-0098.
- [ ] Digest settings match `ai-digest-tab.tsx` and `steward-tab.tsx` labels.
- [ ] `bun run check` passes. No app UI change, so no demo.

## Open questions
- Should the quick card (C-391) be here or in `concepts/board.md`? Default: one paragraph here, linking the Board
  page; the Board page is not edited.
