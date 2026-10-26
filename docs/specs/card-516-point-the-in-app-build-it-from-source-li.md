# C-516: Point the in-app 'Build it from source' link at the docs site

## Why
The install guide and onboarding send a person without a prebuilt runner to the runner's GitHub README, a contributor file whose clone step even says 'cd AgentDock'. The docs site has no build-from-source section, and the docs-site URL is hard-coded in one place.

## What
- A Build from source section on the docs site's Pair a runner page.
- lib/docs-site.ts with DOCS_SITE_URL and docsUrl(); the upgrade link and the build-from-source link use it.
- The runner README's clone step fixed.
- The 'What's new' changelog link stays on GitHub (the docs site has no changelog).

## Done when
- No web link to apps/runner/README.md; a unit test pins both links to DOCS_SITE_URL; the anchor resolves in the docs build.
- Link target only, no visible UI change, so no demo.

Evidence: apps/web/src/lib/runners/install.ts:57-59; apps/web/src/lib/updates/product-update.ts:13-14; apps/runner/README.md:36

Spec: docs/specs/card-516-runner-links-point-at-the-docs-site.md
