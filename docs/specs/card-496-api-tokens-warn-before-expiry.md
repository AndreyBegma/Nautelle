# C-496: Personal API tokens warn their owner before they expire

Stack **S-20**, stage 4: after C-495, which also adds a kind to the shared kind list and the format maps.

## Summary
A personal API token with an expiry date simply stops working on that day (ADR-0104). The CI job or script that uses it fails, and its owner finds out from the failure. This card notifies the owner 7 days ahead, and again 1 day ahead.

## Scope
**In:** a daily job, and a new kind `api_token.expiring`.
**Out:** extending a token (create a new one), and tokens without an expiry.

## Current behaviour
- [Confirmed] `apps/api/src/auth/api-tokens.service.ts:46-79`: a token's `expiresAt` is set on create and is optional. `ApiToken.expiresAt DateTime?` is at `schema.prisma:247-248`, along with `lastUsedAt`.
- [Confirmed] No code notifies about expiry (grep for `expiresAt` in `apps/api/src/notifications`).
- [Confirmed] Account-scope kinds go to the user the event is about (`packages/shared/src/notifications/kinds.ts:80-85`).

## Decisions
- Kind `api_token.expiring`, scope `account`, in-app and email on, Telegram off. A token is a desk matter.
- A daily job at 09:00 server time, `api-token-expiry` on `SchedulerRegistry`, finds unrevoked tokens with `expiresAt` in `[now+6d, now+7d)` or `[now, now+1d)`. It writes one notification per token and window. **No column and no migration:** each token falls in each one-day window exactly once, and a missed day (API down) skips that warning, which is acceptable.
- Title "API token "<name>" expires on <date>"; link `/account#api-tokens`. The token's hint is shown; the token itself is never shown.
- A token never used (`lastUsedAt` null) still warns, because its owner made it for something.

## Acceptance criteria
- [ ] `api-token-expiry.job.spec.ts`: with fixed clocks, a token expiring in 6.5 days warns once. One expiring in 12 h warns once. One already revoked or expired, or with no expiry, never warns.
- [ ] `api-tokens.e2e.spec.ts` (authorization): the notification goes to the owner only.
- [ ] Account › Notifications lists "API token expiring". The web and email `Record<NotificationKind>` maps have the kind.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-api-token-expiry-warning.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the bell item for a seeded token and opens Account › API tokens.

## Risks
- Several API instances would each run the job. [Unknown] whether the deployment runs more than one. The job takes a Postgres advisory lock (`pg_try_advisory_xact_lock`) for the sweep, as `apps/api/src/notifications/runner-watcher.ts` does.

## Open questions
- None.
