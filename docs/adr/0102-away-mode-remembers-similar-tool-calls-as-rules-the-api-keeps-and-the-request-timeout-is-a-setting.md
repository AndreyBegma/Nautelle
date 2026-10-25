# ADR-0102: Away mode remembers similar tool calls as rules the API keeps, and the request timeout is a setting

Status: accepted · Date: 2026-10-25 · Amends [spec 201](../specs/201-claude-code-integration.md)
D12, D17 and D18 · Relates to [ADR-0052](0052-a-remote-tool-use-request-always-carries-a-redacted-preview.md)
· Card: C-401

## Context

In away mode every tool call Claude Code asks permission for becomes a
`tool_use` action request a person answers one by one in the web app, the
Inbox or Telegram. The request lived five minutes and the hook polled for 280
seconds; after that Claude Code showed its local dialog, so an unattended
session stalled at the first call nobody answered in time. Claude Code's
`PermissionRequest` hook input carries `permission_suggestions` with
`addRules` — the rule its own dialog would offer for "don't ask again" — and
Nautelle never offered it.

## Decision

1. **Four answers.** A `tool_use` request is answered with Allow, Allow
   similar in this session, Always allow in this project, or Deny. The two
   middle ones approve the call and store a rule (`tool_use_rules`) with the
   scope `session` (the request's session, gone with it) or `project` (until
   a person removes it). `POST …/action-requests/:id/decide` takes
   `remember: 'session' | 'project'` with an approval; Telegram has the
   callbacks `xs:` and `xp:` beside `x:` and `y:`.
2. **The rule is Claude Code's own shape.** A rule is `{toolName,
   ruleContent?}` — `Bash(npm test:*)` — taken from the hook's `addRules`
   allow suggestions, which the hook forwards and the daemon caps and redacts
   like the tool input. Without a suggestion the rule is the call itself (the
   exact command, the file path, the WebFetch domain). A rule that would allow
   a whole shell or interpreter (`Bash`, `Bash(python:*)`) is never stored.
3. **The API keeps and applies the rules; Claude Code never learns them.**
   Rules are not returned as `updatedPermissions`. Every later call still
   reaches the API, which checks it for danger, matches it against the
   project's and the session's rules, and answers it at once as `approved`
   with `ruleId`, with no notification. So every rule can be listed and
   removed in project Settings → Away mode (operators), and every creation,
   use and removal is audited (`tool_rule.created`, `tool_rule.used`,
   `tool_rule.deleted`). After a remembered approval, the project's other
   pending requests the new rule covers are approved too.
4. **Matching is a strict subset of Claude Code's rule semantics**, on the
   redacted preview of ADR-0052: a tool-wide rule; for a shell, one exact
   command or a word prefix (`npm test:*` covers `npm test -- x`, never
   `npm testing`); for WebFetch, `domain:<host>`; any other content only when
   Claude Code suggested that same rule for the call. A shell command with an
   operator (`&&`, `;`, `|`, a redirect, `$(…)`, a backtick, a newline) never
   matches, and a call whose preview is truncated or missing is never matched
   nor remembered — the omitted middle may hold anything.
5. **Dangerous calls always ask.** `toolUseDanger` in
   `packages/shared/src/action-requests/tool-rules.ts`, with its tests, names
   destructive shell (`rm -r`, `sudo`, `find -delete`/`-exec`,
   `git reset --hard`, `git clean -f`, `git branch -D`, `dd`, `mkfs`,
   `gh pr merge`, `migrate reset`, piping into a shell or interpreter and the
   like), a `git push` that may reach a protected branch (`main`, `master`,
   `develop`, `release/*`, `production` …, `HEAD`, any force, delete or
   mirror push, or a push that names no branch), and reading secrets or
   credential files (`.env` but not `.env.example`, keys, `~/.ssh`, `~/.aws`,
   `.netrc`, the runner's `runner.json`, printing the environment …). Such a
   call is never answered by a rule, and remembering it is refused with
   `409 not_rememberable`, deciding nothing.
6. **The timeout is a setting.** `Project.toolUseTimeoutMinutes`, else the
   requester's `UserSettings.toolUseTimeoutMinutes`, else five minutes; 1 to
   720 minutes. An admin sets the project's in Settings → Away mode; a person
   sets their own on the account page. The hook polls until the request's
   `expiresAt` by the API's clock — every 2 seconds at first, every 10 after
   — and its timeout in the plugin and the card wiring is 12 hours and five
   minutes (`PERMISSION_HOOK_TIMEOUT_S`), so a long timeout keeps the session
   waiting instead of falling back to the local dialog.

## Consequences

- An away session that hits the same kind of call twice asks once; a
  dangerous call always asks.
- The API must be deployed before runners that send `suggestions`: an older
  API's strict `tool_use` args schema rejects the unknown field, and the
  request fails. A runner without the new hook still
  works with rules (the API matches the call itself) but waits at most its
  old 280 seconds.
- A long timeout holds a Claude Code session, and its slot, for up to twelve
  hours on one unanswered call.
- Rejected:
  - **Return the rules to Claude Code as `updatedPermissions`.** Claude Code
    would then answer later calls itself: no danger check per call, no
    audit, and no way to list or remove the rule from Nautelle.
  - **Match on Claude Code's full rule grammar.** Its glob and path forms
    are broad and not documented to the letter; a narrower match only asks
    more often.
