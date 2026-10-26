# C-476: Getting started covers operators, notifications and an AI provider

Stack **S-20**, stage 0.

## Summary
Getting started is shown only to admins, and its optional steps stop at the GitHub App and teammates. An invited operator gets no first-run guidance at all. Nobody is pointed at notifications, which make away mode and the Inbox reach a phone. The features that need an AI provider (summaries, digests, Quick card) stay off until an admin happens to find Admin › AI providers. This card adds the two steps and a short checklist for operators.

## Scope
**In:**
- `apps/web/src/components/onboarding/steps.ts` and its context;
- `OnboardingFacts`;
- the onboarding API: the existing admin read, and a new read for the signed-in user.

**Out:** the required admin steps and their order (C-396, ADR-0103); viewers.

## Current behaviour
- [Confirmed] `apps/web/src/components/onboarding/steps.ts:48-53`: "Only admins see it". The steps are listed at `:72-136`: install, pair, project, profile, plugin, push, card, then optional github and invite.
- [Confirmed] `apps/web/src/components/onboarding/getting-started-context.tsx:42,54` fetches `/admin/onboarding` only when `role === 'admin'`.
- [Confirmed] `apps/api/src/onboarding/onboarding.controller.ts:6-8`: `@Roles('admin')`, `GET /admin/onboarding`.
- [Confirmed] `packages/shared/src/setup/onboarding.ts:11-27`: `OnboardingFacts` has profile, plugin, pushCheck, firstCard, githubApp and teammates.

## API
- `OnboardingFacts` gains `aiProvider: boolean` (at least one enabled LLM provider) and `notifications: boolean` (the caller has a linked Telegram chat, email on, or a project or workspace Slack webhook set).
- `GET /onboarding/me` (any signed-in operator or admin) → `{ notifications: boolean; cardRun: boolean; projectCount: number }`. `cardRun` is true when the caller has started a card round on any project. The read covers the caller only.

## Decisions
- **Admins:** two new optional steps after `card`.
  - "Add an AI provider" → `/admin/ai-providers`.
  - "Turn on notifications" → `/account/notifications`.
  - Optional steps never hide the checklist (`steps.ts:19`).
- **Operators** get a three-step list, shown until all three are done or dismissed.
  - "Open a project you are a member of" → `/projects`.
  - "Turn on notifications" → `/account/notifications`.
  - "Run a card" → the first project's Board.
- **Viewers** get nothing; they cannot act on any step.
- The operator list uses the same glass-ui checklist component and the same dismissal as the admin list. ADR-0103's "from real state" holds: every tick comes from the API.

## Acceptance criteria
- [ ] `steps.test.ts`: the admin list has the two new optional steps, and "N of 7" is unchanged. The operator list has three steps, ticked from `/onboarding/me`.
- [ ] `onboarding.e2e.spec.ts`: `GET /onboarding/me` answers for the caller only. A viewer gets 403, and an operator's answer reflects their own Telegram link and their own rounds, never another user's (authorization).
- [ ] `GET /admin/onboarding` answers `aiProvider` and `notifications` from real rows.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-getting-started-for-operators.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the admin's new optional steps and opens "Turn on notifications".

## Risks
- The demo signs in as the admin. The operator view is covered by the unit test, unless the shared admin can sign in as a seeded operator.

## Open questions
- Should the operator checklist count toward the rail's setup link? Default: no, the rail link stays admin-only.
