# C-406: Housekeeping: wire the Steward digest panel, close shipped issues, update the PRD and roadmap

Part of the 2026-10-25 core and UX plan, settled with the person in a grilling session. Order of the plan: speed → daily flow → fleet scale → team. Nothing is removed in this iteration: pages and routes stay; roles and entry points may change.

## What
- `apps/web/src/components/steward/digest-panel.tsx:148` (`DigestPanel`) is not imported anywhere and `GET …/steward/digest/latest` has no UI: show it in Activity (and link it from Settings › Steward).
- Close GitHub issues already shipped but still open (#500, #886, #891 and any other whose PR merged with "Closes" into develop, since Closes does not fire on develop).
- `docs/product/prd.md:48` still lists "A task tracker of its own" as a non-goal, which the Board contradicts: update the PRD. Bring `docs/product/roadmap.md` (stops at M4; Codex M4 frozen per spec 741) to the Board era and this plan's four stages.

## Done when
The panel shows the latest digest, the listed issues are closed, and the PRD/roadmap match the product.

Spec: docs/specs/card-406-housekeeping-wire-the-steward-digest-pan.md (PR #937)
