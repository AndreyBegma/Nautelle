# C-516: The in-app "Build it from source" links open the docs site

Stack **S-21 "Docs match the product"**, stage 0. Part of the 2026-10-26 improvement plan.

## Summary
The install guide and onboarding send a person who has no prebuilt runner to the runner's GitHub README, a
contributor document. Add a **Build from source** section to the docs site's Pair a runner page and point the link
there, through one docs-site base constant the web already needs.

## Scope
**In:** `apps/web/src/lib/runners/install.ts`, `apps/web/src/lib/updates/product-update.ts`, a new
`apps/web/src/lib/docs-site.ts`, `apps/docs/src/content/docs/getting-started/pair-a-runner.md`,
`apps/runner/README.md` (one stale line).
**Out:** `apps/web/src/lib/runners/update.ts` — its `RUNNER_CHANGELOG_URL` (`:11-12`) backs the "What's new in X"
link (`components/runners/runner-update-notice.tsx:44-50`), and the changelog is on GitHub only; the docs site's
upgrade page links the same file (`operations/upgrade.md:67`). Kept as is.

## Current state
- [Confirmed] `apps/web/src/lib/runners/install.ts:57-59` — `RUNNER_README_URL` =
  `…/blob/main/apps/runner/README.md`, used by "Build it from source" in
  `apps/web/src/app/install/install-guide.tsx:347-354` and `components/onboarding/runner-commands.tsx:43-51`.
- [Confirmed] The docs site has no build-from-source text: `getting-started/pair-a-runner.md` covers Homebrew and
  npm only. The steps are in `apps/runner/README.md:33-39`, whose `cd AgentDock` after cloning `Nautelle` is stale.
- [Confirmed] `apps/web/src/lib/updates/product-update.ts:13-14` hard-codes
  `https://andreybegma.github.io/Nautelle/operations/upgrade/`.

## Decisions
- One base: `DOCS_SITE_URL = 'https://andreybegma.github.io/Nautelle'` and `docsUrl(path)` in
  `lib/docs-site.ts`; `UPGRADE_GUIDE_URL` and the renamed `RUNNER_SOURCE_BUILD_URL`
  (`docsUrl('/getting-started/pair-a-runner/#build-from-source')`) use it.
- The link text and placement do not change, so there is no visible UI change and no demo; the reviewer checks
  the target instead.

## What
1. `pair-a-runner.md`: a **Build from source** section after "Install and pair" (Bun, clone, `bun install && bun run
   build`, `apps/runner/dist/nautelle-runner version`, then the same `pair`).
2. `lib/docs-site.ts` with the base and helper; use it in `product-update.ts` and `install.ts`; update both
   importers of the renamed constant.
3. `apps/runner/README.md:36`: `cd Nautelle`.

## Acceptance criteria
- [ ] A unit test asserts `RUNNER_SOURCE_BUILD_URL` and `UPGRADE_GUIDE_URL` start with `DOCS_SITE_URL`.
- [ ] `grep -rn "apps/runner/README.md" apps/web/src` finds nothing.
- [ ] `bun run --cwd apps/docs build` passes and `#build-from-source` resolves on the built page.
- [ ] `bun run check` and the web tests pass. Link target only, no visible UI change, so no demo.

## Open questions
- The docs site can be moved with `DOCS_SITE`/`DOCS_BASE` (`apps/docs/astro.config.mjs:1-3`); should the web read a
  `NEXT_PUBLIC_DOCS_URL`? Default: no, out of scope; the constant makes it a one-line change later.
