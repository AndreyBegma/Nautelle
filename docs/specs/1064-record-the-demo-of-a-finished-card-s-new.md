# C-455: Record the demo of a Finished card's new green head outside the CI pass

Issue: #1064

## Why
A Finished card the CI pass does not read (auto-merge off, a protected path) is only watched for a merge. A new green head on its PR never gets a demo, and the old demo stays.

## What
- The merge watch supersedes an older head's demo in flight and records a demo for a new green head, without storing checks or merging.

## Done when
- A Finished card with auto-merge off gets one auto demo of a new green head; ciState and column unchanged; no merge.
- A needsPerson card gets none (ADR-0095 §1).
- Pending or red heads get none.

Evidence: apps/api/src/board/board-shipping.ts:381-387, 417-453

Spec: docs/specs/card-455-demo-for-finished-card-outside-ci-pass.md
