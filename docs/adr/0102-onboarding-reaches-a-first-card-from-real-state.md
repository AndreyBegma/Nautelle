# ADR-0102: Onboarding reaches a first card from real state

Status: accepted · Date: 2026-10-25 · Card: C-396 ·
Spec: [`docs/specs/card-396-onboarding-to-the-first-card-a-full-chec.md`](../specs/card-396-onboarding-to-the-first-card-a-full-chec.md) ·
Amends [spec 10](../specs/10-projects.md) D4 and the Connect dialog ·
Relates to [ADR-0001](0001-control-plane-and-per-machine-runner.md), [ADR-0010](0010-typed-command-allowlist-on-the-runner.md), [ADR-0023](0023-runners-advertise-their-commands.md), [ADR-0047](0047-a-runner-local-security-policy-the-server-cannot-change.md)

## Context

Getting started on the Overview stopped at a connected project. The steps an
install still needs before a card can ship (a runtime profile, the Claude Code
plugin, push access to origin) were not on it, and its optional steps were
hard-coded as not done. Connecting meant typing an absolute path on another
machine. The base branch ignored `develop`, which most repositories with a
`develop` branch use for pull requests. Nothing checked that the runner could
push until the first card failed to. The `/setup` link was only in the
container logs.

## Decision

1. **Seven counted steps, all from real state.** Install the runner, pair it
   and keep it online, connect a project, pick a runtime profile, install the
   Claude Code plugin, pass a push check, and run a first card to a pull
   request. The optional GitHub App and teammates steps tick the same way and
   are not counted. "Pair" and "online" are one step, and the old "admin
   account" step is gone (an admin is reading the checklist), so the count is
   "n / 7".
2. **`GET /admin/onboarding` returns only the facts no other list has**:
   `profile` (a project has a default or orchestrator profile), `plugin` (a
   non-revoked runner reports the plugin in a profile's capabilities),
   `pushCheck` (the newest check of a connected project's checkout, passed
   first), `firstCard` (`none`, `pr` or `merged`), `githubApp` (an app with a
   non-suspended installation) and `teammates` (more than one user). The web
   app combines them with `/admin/runners` and `/projects`. The first card
   counts at its pull request; merging is the person's call.
3. **One loader in the shell.** A provider loads the checklist state once and
   polls it every 15 s while a counted step is open. The Overview checklist
   and the rail's "Finish setup · project n / 7" link read it; the link is
   hidden once setup is done and on the icon-only rail.
4. **`project.discover` lists the repositories under the allowed roots.** The
   runner walks the policy's `allowedRoots` (ADR-0047) to depth 3, at most
   5000 directories and 200 repositories, and reads each `.git/config` as text
   for origin's `owner/name`. It runs no git, so no repository's config can
   run anything. A hit limit is reported as `truncated`. The Connect dialog
   lists the result with a search and **Use repository**; the typed path stays
   for a repository outside the roots or a runner too old for the command.
5. **`develop` is the base when it is in use.** After `orchestrator.base` in
   the config, the base is `develop` when `origin/develop` exists and its tip
   was committed in the last 90 days (`baseSource: develop`). Otherwise the
   order of spec 10 D4 is unchanged.
6. **`project.push_check` runs `git push --dry-run`** to
   `refs/heads/nautelle/push-check` on origin. Nothing is pushed. A refusal is
   a result (`ok: false` with git's last lines, credentials removed), not a
   command error. The API stores the latest answer per runner and checkout in
   `repository_push_checks`, so a check run in the Connect dialog, before the
   project exists, counts once it is connected. Both commands are admin-only,
   like `project.inspect`, and are advertised as the `repoPicker` and
   `pushCheck` features (ADR-0023).
7. **The `/setup` link is printed where a new install looks.** The Helm NOTES
   name it, and `/setup` with no users shows the log commands that print it
   for Compose, the all-in-one image and Helm.

## Consequences

- The control plane still never reads a project's files (ADR-0001): the
  runner discovers and checks, through typed commands (ADR-0010).
- A failed push check never blocks Connect. The checklist shows git's answer
  and a button to run the check again once access is fixed.
- A repository whose `develop` branch is stale keeps its default branch; one
  that wants `develop` regardless sets `orchestrator.base`.
- Rejected: listing the GitHub App's repositories in the picker. The app may
  not be installed yet, and a repository it lists may not be cloned on the
  runner.
- Rejected: storing the push check on the project. The dialog checks before a
  project exists, and the result would have to be carried through Connect.
