# C-526: Make the update banner show current → new version, copyable upgrade commands and a How to update section

## Problem
When a newer Nautelle release exists, the app shell shows `ProductUpdateNotice` (apps/web/src/components/updates/product-update-notice.tsx; check in apps/api/src/updates/product-release.service.ts). It is an info banner with a sentence, a release-notes link and two inline commands. A person does not see at a glance how far behind the install is, and has to retype the commands.

## What done looks like
- The banner shows the running version and the new one side by side: the running version in a danger tone (red), the new one in a success tone (green), with an arrow between them. Tones come from glass-ui tokens; if glass-ui has no fitting version or badge component, it is added to glass-ui (ADR-0011).
- A "How to update" disclosure in the banner lists the ways to upgrade, from docs `operations/upgrade.md`: `docker compose pull` + `docker compose up -d`, re-running `install.sh`, and the pinned-version (`NAUTELLE_VERSION`) note. Each command is in a code block with a copy button.
- "Take a backup first" is stated, with a link to the backup page.
- Links: release notes of the new version, and the docs site's Upgrade page.
- The banner never offers to run the upgrade from the web app: the server cannot restart its own compose stack, and a runner may live on another machine.
- Dismissing still hides it until the next release, as today.
- Light and dark themes, phone width.
- Tests updated (product-update-notice.test.tsx), demo scenario shows the banner, opens How to update and copies a command, ending on the copied state.
