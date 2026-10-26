---
title: The Inbox, approvals and Away mode
description: What waits on you, the four answers to a tool call, and how Away mode remembers similar calls.
---

Most of the day in Nautelle is answering what agents ask. This page covers the
Inbox, where everything that waits on you is listed, and the approvals for
tool calls, including Away mode and the rules it remembers.

## The Inbox

The **Inbox** is one list of every item that waits for a decision of yours,
across every project where you are an operator or higher. An admin sees every
project. A viewer has no Inbox.

The count on the Inbox page, the badge in the navigation rail, the bell and
the "Needs you" preview on Overview all count the same items, because they
read the same list. Items are grouped by project, oldest first. You can filter
by kind and by project, and each kind shows its count.

An item leaves the list as soon as its condition stops holding, whoever handled
it. A card that was merged, for example, leaves because it completes itself.

### Item kinds

| Kind | It exists when |
|---|---|
| Question | The card's round shows a question screen: the agent asked you something. |
| Design | The card's design is in review and no design is approved yet. |
| Merge | A Finished card at rest has an open pull request that is not merged. It carries the card's newest demo. |
| Failed | The card needs a person, its collect failed, its In progress round failed, or an automatic run was refused. Not while a round is active. Retry either runs the card again or collects its result. |
| Permission | A tool-use request is pending, has not expired, and you may decide it. |
| Setup | A project with an open card has a readiness blocker. A project nobody works in waits on nobody. |

### What the Inbox does not list

- Fleet cards, fleet merge approvals and slot prompts stay on **Fleet** and the
  Queue, because their worker is the orchestrator and those pages already
  decide them.
- Failed orchestrator runs stay in **Activity**.
- The Terminal → Board checklist stays in **Settings**.

If a project's readiness cannot be read, the Inbox names that project and still
loads the rest.

The Inbox only reads. Every action you take from it goes to the same place it
would from the card, the request or the design.

## Answering a tool call

When Claude Code asks permission for a tool call and you are away, the request
becomes a **tool-use request** that you answer in the web app, in the Inbox or
in Telegram. There are four answers:

| Answer | What it does |
|---|---|
| **Allow** | Approves this one call. |
| **Allow similar** | Approves the call and remembers a rule for this session. The rule is gone when the session ends. |
| **Always allow** | Approves the call and remembers a rule for this project, until a person removes it. |
| **Deny** | Refuses the call. |

In Telegram the buttons are the same four.

## Away mode

In Away mode every call Claude Code would ask about locally is sent to you
instead, so an unattended session waits for your answer rather than for a
dialog nobody sees.

Remembered rules keep such a session moving. Once you allow a kind of call
and have it remembered, a later call of that kind is approved at once, with no
notification, and a session that hits the same kind of call twice asks only
once.

### How rules work

- **The API keeps the rules; Claude Code never learns them.** Every later call
  still reaches the API, which checks it for danger, matches it against the
  project's and the session's rules and answers it. That is why every rule can
  be listed and removed, and why each creation, use and removal is audited.
- **A rule has Claude Code's own shape**, such as `Bash(npm test:*)`. It comes
  from the rule Claude Code itself would offer for "don't ask again". Without
  one, the rule is the call itself: the exact command, the exact file path or
  the web domain. Only tools that read, search or delegate get a rule for the
  whole tool.
- **Matching is narrower than Claude Code's.** For a shell command, a rule
  matches one exact command or a word prefix: `npm test:*` covers
  `npm test -- x` and never `npm testing`. A file tool matches the exact path,
  and a web fetch matches a domain.
- **Other calls are allowed once.** A call without a suggested rule, and that
  is not a read-only tool, such as an MCP tool, is approved for this call only.
- **After a remembered approval**, the project's other pending requests that the
  new rule covers are approved too.

You manage a project's rules in **Settings → Away mode** (operators). Removing
a rule there means the next such call asks again.

### What is never remembered

Some rules would allow far too much, so Nautelle refuses to store them:

- a rule for a whole shell or for a tool that writes files;
- a command prefix that starts with a shell, an interpreter, `ssh`, `sudo`,
  `docker` or `kubectl`, whatever follows;
- a prefix that is only a wrapper, such as `timeout`, `npx` or `uv run`;
- a prefix that stops at a package manager, its `run`, or a subcommand that
  runs code, such as `npm:*`, `bun run:*` or `git:*`.

A shell command with an operator (`&&`, `;`, `|`, a redirect, `$(…)`, a
backtick, a newline or a subshell) never matches a rule. A call whose preview
is truncated or missing is never matched and never remembered.

### Dangerous calls always ask

Whatever rules exist, a dangerous call is never answered by a rule. It asks
you every time, and trying to remember it is refused. The check covers, among
other things:

- destructive shell commands, such as `rm -r`, `sudo`, `git reset --hard` and
  `dd`, including when hidden behind quotes, wrappers or subshells;
- piping into a shell and inline code such as `bash -c` or `python -c`;
- writing agent, hook, git or shell configuration that could switch the check
  off, for example `.claude/`, `.mcp.json` or `.git/hooks`;
- a `git push` that may reach a protected branch, and any force, delete or
  mirror push;
- reading secrets and credential files, such as `.env`, keys, `~/.ssh` or the
  environment dump from `env` and `printenv`.

## How long a call waits

An unanswered request waits for its timeout, then Claude Code shows its local
dialog. The timeout is the first that is set of:

1. the project's timeout, which an admin sets in **Settings → Away mode**;
2. the requester's own timeout, set on their account page;
3. five minutes.

It can be from 1 to 720 minutes. A long timeout holds the Claude Code session,
and its slot, for as long as the call is unanswered, up to twelve hours.

Runners must be new enough for this: a runner without the newer hook still
works with rules, but waits at most 280 seconds for an answer.

## Sources

- [ADR-0105](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0105-away-mode-remembers-similar-tool-calls-as-rules-the-api-keeps-and-the-request-timeout-is-a-setting.md):
  Away mode rules and the request timeout.
- [ADR-0106](https://github.com/AndreyBegma/Nautelle/blob/develop/docs/adr/0106-the-inbox-is-one-server-read-of-what-waits-on-the-person.md):
  the Inbox.
