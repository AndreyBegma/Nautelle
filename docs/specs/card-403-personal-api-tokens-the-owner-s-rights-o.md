# C-403: Personal API tokens: the owner's rights or read-only, project scope, expiry, audit and revoke

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Scripts and automation have no API credential today; this session had to drive the API through a browser session with the CSRF header.

## What
- Account › API tokens: create a token with a name, scope (the owner's rights, or read-only), an optional project list and an expiry; shown once, stored hashed. List with last use; revoke.
- `Authorization: Bearer <token>` on the REST API, no CSRF; the token never exceeds its owner's current role. Every use is attributed to the owner in the audit log as "via token <name>".
- Admin can see and revoke users' tokens.

## Done when
`curl -H 'Authorization: Bearer …'` can list and run cards within scope, and a read-only token is refused writes. e2e for scope, expiry and revoke.

Spec: docs/specs/card-403-personal-api-tokens-the-owner-s-rights-o.md (PR #937)
