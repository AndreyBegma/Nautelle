# C-410: Demo videos skip the sign-in: DemoFlow 0.7.0 pin, a shared off-camera sign-in fragment, worker prompt

## Why
Every card demo starts by filling Email and Password and clicking "Sign in". It is copied into each `demoflow/cards/*.demo.json` and recorded, so every video opens with a login nobody needs to watch. DemoFlow 0.7.0 (DemoFlow C-171, PR AndreyBegma/DemoFlow#343, ADR-0018 there) adds reusable step fragments (`include`) and off-camera steps (`setup` / `record: false`).

## What
1. Bump the runner's DemoFlow pin from `demoflow@0.6.0` to `demoflow@0.7.0` (`apps/runner/src/demos/pin.ts`), plus any version checks or tests that name 0.6.0.
2. Add a shared fragment `demoflow/fragments/sign-in.json` that signs in with `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` (from env) and takes a `next` path parameter. Use the fragment syntax exactly as DemoFlow 0.7.0 documents it (read its docs/schema in node_modules or the DemoFlow repo; do not guess field names).
3. Update the worker prompt's "Demo video" section (`packages/shared/src/board/worker-prompt.ts`, and bump its prompt version) so new scenarios sign in through the fragment off camera (in `setup`, or included with `record: false`) and start recording on the first step that matters.
4. Convert the existing `demoflow/cards/*.demo.json` that start with the copied sign-in steps to the fragment, and validate each with DemoFlow 0.7.0.
5. Release the runner (a patch or minor runner release per `docs/` release rules) so the devbox runner records with 0.7.0. Note it in the PR; the orchestrator installs it.

## Done when
- A recorded card demo on the demo stack starts already signed in, and the sign-in does not appear in the video (attach the run or a screenshot of the first frame).
- All converted scenarios validate with DemoFlow 0.7.0.
- Runner tests and `bun run check` pass.
- After the merge, DemoFlow card C-171's own demo can be recorded by the runner (the 0.6.0 pin rejected its `setup` field).

Migration/ADR numbers if needed: migration 20261231000037, ADR 0110.

## Also in the worker prompt (seen on 2026-10-25: 7 of 12 card demos failed first time)
- Before finishing, **record** the scenario against the demo stack (`sh scripts/demo-dev.sh` + DemoFlow run), not only validate it. A validated scenario still fails at run time.
- Most failures were Playwright strict-mode violations: `getByText`/`getByLabel`/`getByTestId` matching 2+ elements (filter <option>s, list rows, a second field with the same label). Tell the worker to use locators that match exactly one element: scope to a region, use role+name, or add a unique label/test id.
- Other failures: selectors that no longer exist after another merged card changed the UI (⌘K placeholder, the wide card page has no Rounds tab). Merge origin/develop before recording.
