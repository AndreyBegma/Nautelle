# C-448: `pair` offers to allow session messaging, and the policy notice names the gated commands

Stack **S-18 "Sessions, terminal and runner"**, stage 1.

## Summary
Messaging a running session (`session.message`, `slot.message`, `orchestrator.message`) is off on every new runner
until the person runs `nautelle-runner policy set commands.<name> true` (ADR-0047). Nothing at pairing says so: the
person finds out from a `policy_refused` on the first message. The policy upgrade notice also still says "AgentDock
runner 0.13" and does not mention the gated commands.

## Scope
**In:** `pairCommand` and `USAGE` in `apps/runner/src/cli.ts`, `apps/runner/src/policy/upgrade.ts`, the runner
README's pairing section, tests.
**Out:** changing any default (they stay off, ADR-0047); `setup claude` (Open question).

## Current behaviour
- [Confirmed] `packages/shared/src/protocol/policy.ts:18-28`: `POLICY_GATED_COMMANDS` = `orchestrator.message`,
  `slot.message`, `session.message`, off until turned on.
- [Confirmed] `apps/runner/src/policy/schema.ts:14-16`: each gated command defaults to `false`.
- [Confirmed] `apps/runner/src/cli.ts:91`: `pair` takes `--allow-root` but has no flag or question for messaging.
- [Confirmed] `apps/runner/src/policy/upgrade.ts:34,68`: "AgentDock runner 0.13 upgrade" and "runner 0.13 upgrade:"
  in the notice and the journal line; neither mentions gated commands.

## Decisions
- D1. `pair` gains `--allow-messages` (a boolean flag) that sets the three gated commands to `true` in
  the same `runner.json` write as `--allow-root`. *Source: ADR-0047 §1 (`pair --allow-root` already writes the policy) and §6 — the person on the machine changes the
  policy; a flag they type is that.*
- D2. In a terminal (stdin and stdout TTY) without the flag, `pair` asks once after pairing: "Allow messages from
  Nautelle to running sessions on this machine? [y/N]". No answer or not a TTY → off, and `pair` prints the
  `policy set` command that turns it on.
- D3. The upgrade notice and journal line say "Nautelle runner policy" (no product or version), and add one line:
  "Messaging running sessions is off; turn it on with `nautelle-runner policy set commands.session.message true`."
  *Source: ADR-0073 (renamed to Nautelle).*

## Acceptance criteria
- [ ] `cli.spec.ts`: `pair --allow-messages` writes the three commands `true`; `pair` without it, with a fake
      confirm answering yes, writes `true`; answering no or no TTY writes nothing and prints the command.
- [ ] `policy.spec.ts`: the notice has no "AgentDock" and no "0.13", and names the gated command line.
- [ ] `USAGE` and the runner README list `--allow-messages`.
- [ ] `bun run check` and the runner tests pass.

## Risks
- A person who presses Enter gets the safe default (off), as today.

## Open questions
- Ask the same in `setup claude`? Default: no — `setup` installs the plugin; the question belongs to pairing.
