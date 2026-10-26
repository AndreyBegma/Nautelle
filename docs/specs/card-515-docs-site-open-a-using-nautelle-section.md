# C-515: Docs site: open a 'Using Nautelle' section with the Inbox, approvals and Away mode page

## Why
The docs site covers install, configuration and operations, but nothing a person does every day. The Inbox (ADR-0106), tool-call approvals and Away mode with its allow-similar rules (ADR-0105) have no page.

## What
- A 'Using Nautelle' sidebar group that autogenerates from the using/ folder, so later page cards add a file without touching the config.
- The first page: the Inbox and its item kinds, the four answers to a tool call, Away mode, rules (what is never remembered), how long a call waits.

## Done when
- The docs build passes and the page shows under Using Nautelle.
- Every statement traces to ADR-0105/0106 or the cited files. No demo (no app UI change).

Evidence: apps/docs/astro.config.mjs:28-66 (no such section); ADR-0105, ADR-0106

Spec: docs/specs/card-515-docs-site-inbox-approvals-away-mode.md
