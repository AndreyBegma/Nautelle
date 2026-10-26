# C-517: List every root script in the developer Commands table

Issue: #989

## Why
Issue #261: a newcomer has to read package.json to find the scripts. The README no longer has a Development table and the Commands table now lives in docs/guides/agent-rules.md, which misses typecheck, db:up, db:down, db:seed, admin:create, format, docs:env and docs:dev; its Structure block misses apps/runner and apps/docs.

## What
- One row per root script in agent-rules.md Commands, a note on the API test:* scripts, apps/runner and apps/docs in Structure.
- The README quick start links that table instead of duplicating it.

## Done when
- Every root script appears once with an accurate description; the README link resolves. Closes #261. No demo.

Evidence: issue #261; docs/guides/agent-rules.md:12-35; package.json scripts; README.md:187-196

Spec: docs/specs/card-517-list-every-root-script-for-developers.md
