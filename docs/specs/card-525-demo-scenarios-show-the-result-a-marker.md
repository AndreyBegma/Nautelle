# C-525: Demo scenarios show the result: a marker and a hold on the final state, and pin the paced DemoFlow engine

## Problem
A person reviews a finished card by its demo video, and today the videos are too fast to follow: text is typed in a blink, the result (a created post, a saved setting) shows for a frame and the recording ends. The run is correct, but the viewer cannot tell what happened. Pacing defaults are being added to the DemoFlow engine (DemoFlow card C-203: dwell after each step, end hold, slower typing). Nautelle has two parts of its own to do.

## What done looks like
- The instructions a card session gets for writing its `demoflow/cards/C-<n>-*.demo.json` scenario (the DemoFlow MCP / scenario prompt the round is launched with, C-369 / ADR-0090) require: one `marker` per user-visible step, a caption on the step that shows the change, and a final `assertVisible` on the end result with a caption — the result is the last thing on screen, never a navigation away.
- The guidance says not to add `wait` steps just to slow the video down; pacing comes from the engine defaults.
- When DemoFlow C-203 is released, the runner's pinned DemoFlow version (`apps/runner/src/demos/pin`) moves to it, so every demo recorded on the runner gets the dwell and the end hold.
- The docs site's demo-video section (apps/docs concepts/board.md) says what pacing a viewer can expect and how a scenario overrides it.
- Tests cover the changed prompt text and the pin.

## Depends on
DemoFlow C-203 (engine pacing defaults) for the pin bump; the scenario guidance part does not wait on it.
