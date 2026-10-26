import { describe, expect, it } from 'bun:test';
import type { CardFleetView, CardRoundBrief } from './contracts';
import type { CardRoundPhase } from './types';
import { isWorkingCard } from './working';

type Card = Parameters<typeof isWorkingCard>[0];

const round = (phase: CardRoundPhase) =>
  ({ round: 1, phase }) as unknown as CardRoundBrief;

const fleet = (extra: Partial<CardFleetView> = {}): CardFleetView => ({
  issue: 12,
  slot: 'fd-1',
  stage: null,
  slotGone: false,
  detached: false,
  ...extra,
});

const card = (extra: Partial<Card> = {}): Card => ({
  source: 'manual',
  column: 'in_progress',
  round: null,
  design: null,
  fleet: null,
  tracking: null,
  taken: null,
  queue: null,
  ...extra,
});

describe('isWorkingCard (C-473)', () => {
  it('a card nothing works on is not at work', () => {
    expect(isWorkingCard(card())).toBe(false);
    expect(isWorkingCard(card({ round: round('finished') }))).toBe(false);
  });

  it('an active round on the card’s own worker is at work', () => {
    expect(isWorkingCard(card({ round: round('waiting') }))).toBe(true);
  });

  it('a live slot is at work until the card is completed', () => {
    const slotted = { source: 'fleet' as const, fleet: fleet() };
    expect(isWorkingCard(card(slotted))).toBe(true);
    expect(isWorkingCard(card({ ...slotted, column: 'completed' }))).toBe(
      false,
    );
    expect(
      isWorkingCard(
        card({ source: 'fleet', fleet: fleet({ slotGone: true }) }),
      ),
    ).toBe(false);
    expect(
      isWorkingCard(card({ source: 'fleet', fleet: fleet({ slot: null }) })),
    ).toBe(false);
  });

  it('a live tracked or taken session is at work, an ended one is not', () => {
    expect(
      isWorkingCard(
        card({ source: 'terminal', tracking: { sessionId: 's', alive: true } }),
      ),
    ).toBe(true);
    expect(
      isWorkingCard(
        card({ taken: { sessionId: 's', alive: true, branch: null } }),
      ),
    ).toBe(true);
    expect(
      isWorkingCard(
        card({ taken: { sessionId: 's', alive: false, branch: null } }),
      ),
    ).toBe(false);
  });

  it('a To Do card in the run queue is at work', () => {
    const queue = { state: 'queued' as const, place: 1, stack: null };
    expect(isWorkingCard(card({ column: 'todo', queue }))).toBe(true);
    expect(isWorkingCard(card({ column: 'in_progress', queue }))).toBe(false);
  });

  it('an Inbox card is never at work', () => {
    expect(
      isWorkingCard(
        card({
          column: 'inbox',
          source: 'terminal',
          tracking: { sessionId: 's', alive: true },
        }),
      ),
    ).toBe(false);
  });
});
