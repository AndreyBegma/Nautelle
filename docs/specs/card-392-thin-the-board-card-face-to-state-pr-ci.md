# C-392: Thin the board card face to state, PR/CI and demo/design/dependency icons

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
A tile stacks up to about 15 chips (Bug, deps, cost, Saved, Steward, handoff, Demo, Design, round pill, hooks, Didn't start, CI dot, sub-state, Auto-run, Ready/Waiting).

## What
On the face: one state signal (running / question / failed / needs you / waiting for a slot), the PR number with its CI colour, and small icons for demo, design and dependencies. Everything else (cost, Saved, Steward, handoff, hooks, round pills) moves into the card sheet. Kind stays as a colour or icon. Keep the accessibility labels.

## Done when
No tile shows more than about four signals; nothing is lost from the sheet.

Spec: docs/specs/card-392-thin-the-board-card-face-to-state-pr-ci.md (PR #937)
