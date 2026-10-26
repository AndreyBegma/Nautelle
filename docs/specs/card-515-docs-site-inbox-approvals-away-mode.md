# C-515: Docs site — a "Using Nautelle" section, starting with Inbox, approvals and Away mode

Stack **S-21 "Docs match the product"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
The documentation site covers install, configuration, operations and four concepts, but none of the daily
surfaces. This card opens a **Using Nautelle** sidebar group and writes its first page: the Inbox, approving a
waiting tool call, and Away mode with its "allow similar" rules. The other S-21 page cards (stage 1) only add files
to the same folder.

## Scope
**In:** `apps/docs/astro.config.mjs` (the sidebar), `apps/docs/src/content/docs/using/inbox-and-away-mode.md`.
**Out:** other docs-site pages, app code, screenshots.

## Current state
- [Confirmed] The sidebar is an explicit list in `apps/docs/astro.config.mjs:28-66`: Getting started,
  Configuration, Operations, Concepts. No page covers the Inbox, approvals or Away mode
  (`apps/docs/src/content/docs/` has `concepts/`, `configuration/`, `getting-started/`, `operations/` only).
- [Confirmed] The Inbox is one server read, `GET /inbox`, of what waits on the caller across every project where
  they are operator or higher; kinds `question`, `design`, `merge`, `failed`, `permission`, `setup`
  (ADR-0106 §1–2). The page is `apps/web/src/app/(app)/inbox/page.tsx`; viewers have no Inbox
  (`docs/ui/screens.md:41`).
- [Confirmed] Tool-call approvals: the four answers Allow · Allow similar in this session · Always allow in this
  project · Deny; rules listed and removed in project Settings › Away mode; dangerous calls always ask; the wait
  is a setting, project then user then five minutes, 1–720 (ADR-0105 §1–6;
  `apps/web/src/app/(app)/projects/[projectId]/settings/away-tab.tsx:253-256`,
  `apps/web/src/app/account/away-timeout-card.tsx`).
- [Confirmed] The old project Approvals page redirects to the Queue's Approvals tab
  (`apps/web/src/app/(app)/projects/[projectId]/approvals/page.tsx:4`).

## Decisions
- New group **Using Nautelle** after Getting started, built with Starlight's
  `autogenerate: { directory: 'using' }`, so the later page cards add a file and never touch the config (avoids five
  cards editing one sidebar; the person, 2026-10-26 interview: no two cards in a stage edit one file).
- Each page sets `sidebar.order` in its frontmatter: this one 1; notifications 2; account security 3; budgets and
  run queue 4; planning and digests 5.
- Pages are written for a person using the product, in the style of `concepts/board.md`: what you see, what each
  action does, where the setting is. Link ADRs by full GitHub URL as the existing pages do.

## What
1. Add the group to the sidebar.
2. Write the page: **The Inbox** (what lands there, each kind and its action, who sees it, the rail badge);
   **Approving a tool call** (where requests appear — Inbox, Queue › Approvals, Telegram — and the four answers);
   **Away mode** (turning it on: `/nautelle:away` in a session, and what changes), **Rules** (what "similar" means,
   what is never remembered, listing and removing rules), **How long a call waits**.

## Acceptance criteria
- [ ] `bun run --cwd apps/docs build` passes and the page shows under **Using Nautelle**.
- [ ] Every statement on the page traces to ADR-0105, ADR-0106 or the files above; a reviewer can check each.
- [ ] No absolute or personal paths; internal links use the site's trailing-slash form (`../../concepts/board/`).
- [ ] `bun run check` passes. No app UI change, so no demo.

## Open questions
- Group name: default **Using Nautelle**.
