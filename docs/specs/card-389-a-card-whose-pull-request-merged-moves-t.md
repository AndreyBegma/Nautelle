# C-389: A card whose pull request merged moves to Completed by itself, and stale Needs-you items clear themselves

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## Why
Finished holds merged cards (19 today) until someone presses Accept, so Finished stops meaning "waits for your review". The Overview "Needs you" list shows items 5 days old for slots that are gone and steward digest failures.

## What
- When a card's PR is merged (by a person on GitHub, through Accept, or by auto-merge), the card moves to Completed automatically; the merge is the person's decision. Accept stays for the no-merge cases. Amend the ADR that says only a person completes a card (ADR-0035/0084 family; new ADR, next free number from origin/develop).
- One-time migration: merged Finished cards move to Completed.
- Needs-you items resolve themselves when they no longer apply: the slot or session is gone, the PR closed or merged, the question answered, the request expired. Service failures (steward digest, AI digest) go to Activity, not to Needs you.

## Done when
Finished shows only unmerged work. The Overview list has no item whose subject is gone. e2e for each auto-resolution path.
