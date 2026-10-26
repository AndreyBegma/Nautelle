# C-490: Admins are notified when someone registers and waits for approval

Stack **S-20**, stage 1: after C-469, which also edits `apps/web/src/lib/notifications/format.ts`.

## Summary
With approval required, a new account waits as `pending` until an admin opens Admin › Users. Nobody is told that it waits. Spec 3 deferred this ("before M2.7: No — the admin page shows a pending count"). Notifications have since grown to in-app, Telegram, email and Slack. This card adds the kind.

## Scope
**In:** a new notification kind `user.pending`, written when a registration creates a pending user.
**Out:** approving from Telegram, and notifying the person who registered.

## Current behaviour
- [Confirmed] `apps/api/src/auth/auth.controller.ts:69-77`: `POST /auth/register` → `auth.register(...)` and answers `{ status: 'pending' }`. `UserStatus.pending` is at `schema.prisma:15-20`.
- [Confirmed] `docs/specs/3-auth-and-access.md:206` is the open question, with the default "No".
- [Confirmed] Admin-scope kinds exist (`packages/shared/src/notifications/kinds.ts:80-85`: scope `admin`, every active admin). `runner.offline` is written straight through `NotificationWriter.write(tx, input, await writer.adminRecipients(tx))` (`apps/api/src/notifications/runner-watcher.ts:120-136`).
- [Confirmed] Each kind needs entries in `Record<NotificationKind, …>` maps: `apps/web/src/lib/notifications/format.ts` (label, example, group, tone) and `apps/api/src/notifications/email-message.ts`.

## Decisions
- Kind `user.pending`, scope `admin`, channels in-app and Telegram, both on by default. It answers spec 3's open question with "yes, now that notifications exist" (the person, 2026-10-26 interview).
- Title "<name or email> asked for an account"; body "Approve or reject them in Admin › Users"; link `/admin/users?tab=pending`. The email address appears only in-app and in Telegram, and it is never sent to Slack (it is not a Slack event).
- `fold: true` within an hour, so a burst of sign-ups is one notification with a count, the same as other folding kinds.
- It is written in the same transaction as the user row. A registration that fails sends nothing.

## Acceptance criteria
- [ ] `auth.e2e.spec.ts`: a registration with approval required writes one `user.pending` notification per active admin and none to operators or viewers.
- [ ] With open registration (users active at once), nothing is written.
- [ ] Three registrations within an hour fold into one notification with `count: 3`.
- [ ] `docs/specs/3-auth-and-access.md`'s open-question row points to this card.
- [ ] The rules table in Account › Notifications lists "Account waiting for approval" for admins only.
- [ ] A DemoFlow demo `demoflow/cards/C-<n>-pending-registration-notifies-admins.demo.json` signs in through `demoflow/fragments/sign-in.json` in `setup`. It then shows the bell item after a seeded registration and opens Admin › Users filtered to pending.

## Risks
- Spam registrations become admin notifications. Registration is already throttled (`ThrottlerGuard` on the route), and folding caps the noise.

## Open questions
- None.
