# C-476: Extend Getting started to operators, notifications and an AI provider

## Why
Getting started is admin-only and never mentions notifications or an AI provider; an invited operator gets no guidance.

## What
- Admins: optional steps Add an AI provider and Turn on notifications.
- Operators: a three-step list (open a project, notifications, run a card) from GET /onboarding/me.
- Viewers: nothing.

## Done when
- steps.test covers both lists.
- /onboarding/me answers for the caller only; viewer 403.
- DemoFlow demo recorded.

Evidence: apps/web/src/components/onboarding/steps.ts:48-53,72-136; apps/api/src/onboarding/onboarding.controller.ts:6-8

Spec: docs/specs/card-476-getting-started-for-operators.md
