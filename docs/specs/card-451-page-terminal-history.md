# C-451: Terminal history is paged instead of one snapshot

Stack **S-18 "Sessions, terminal and runner"**, stage 1 (after C-435, which also edits `terminal-view.tsx`).

## Summary
Scrolling up in the web terminal asks the runner once for the last 5 000 lines of the pane and shows them as a
read-only snapshot. Anything older cannot be reached, a long session sends up to 2 MB on every scroll-up, and the
snapshot does not grow while the person reads.

## Scope
**In:** `packages/shared/src/protocol/terminal.ts`, `apps/runner/src/terminal/history.ts` and `manager.ts`,
`apps/api/src/terminal/terminal-relay.ts`, `apps/web/src/components/terminal/terminal-view.tsx` and its history
controller in `apps/web/src/lib/terminal/`, tests, a DemoFlow demo.
**Out:** tmux's `history-limit` (the pane keeps what tmux keeps); search in history.

## Current behaviour
- [Confirmed] `packages/shared/src/protocol/terminal.ts:32-41`: `TERMINAL_HISTORY_LINES` 5 000,
  `TERMINAL_HISTORY_MAX_BYTES` 2 MB, oldest dropped to fit.
- [Confirmed] `packages/shared/src/protocol/terminal.ts:163-166`: `terminal.history.request` carries only `id`.
- [Confirmed] `apps/runner/src/terminal/history.ts:16-28`: `capture-pane -S -5000`, always from the bottom.
- [Confirmed] `apps/web/src/components/terminal/terminal-view.tsx:107-113,193-198`: one request on scroll-up, shown
  in a second read-only xterm.

## Decisions
- D1. The request gains optional `before` (lines above the bottom of the pane, ≥ 0) and the reply carries
  `{from, to, more}`. A page is `TERMINAL_HISTORY_PAGE_LINES = 1000` lines: the runner captures
  `-S -(before+1000) -E -(before+1)`. Without `before`, the reply is the newest page. *Source: #522 (history over the
  same attach); the 2026-10-26 improvement plan.*
- D2. The browser asks for the next older page when the read-only view is scrolled within one screen of its top,
  and prepends it keeping the scroll position. `more: false` stops asking.
- D3. The API keeps its one-request-at-a-time rule (`TERMINAL_HISTORY_TIMEOUT_MS`) per attach. The first request of
  a view carries no `before`; a reply without `more` (an older runner) is treated as the only page, so the browser
  never sends `before` to a runner that cannot read it. No capability is needed.
- D4. The total kept in the browser is capped at 20 000 lines; past that the oldest page is dropped from the view.

## Acceptance criteria
- [ ] `history.spec.ts`: `before: 0` and `before: 1000` capture the right `-S/-E` ranges; a pane shorter than the
      range returns `more: false`.
- [ ] Shared schema test: `before` is optional and bounded; an older runner's reply without `from/to/more` still
      parses.
- [ ] Web test: scrolling to the top of the history asks for the next page once and keeps the line under the
      cursor in place.
- [ ] DemoFlow demo `demoflow/cards/C-<n>-page-terminal-history.demo.json` (sign-in through
      `demoflow/fragments/sign-in.json` in `setup`): a session with a long output, scroll up past the first page,
      older lines load.
- [ ] `bun run check` and the api, runner and web tests pass.

## Risks
- Output that arrives while paging shifts the bottom; ranges are relative to the bottom at capture time, so a page
  can repeat or skip a few lines. Acceptable for reading back; the live view is unaffected.

## Open questions
- None.
