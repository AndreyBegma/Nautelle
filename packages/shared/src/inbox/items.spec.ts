import { describe, expect, it } from 'bun:test';
import type { BoardCardView, CardRoundBrief } from '../board/contracts';
import type { CardRoundPhase } from '../board/types';
import type { DesignRevisionView } from '../design/contracts';
import type { InboxCardContext } from './items';
import {
  inboxCardItems,
  inboxCounts,
  inboxFailureOf,
  sortInboxItems,
} from './items';

const round = (
  phase: CardRoundPhase,
  extra: Partial<CardRoundBrief> = {},
): CardRoundBrief =>
  ({ round: 1, phase, waitingAt: null, ...extra }) as unknown as CardRoundBrief;

const card = (extra: Partial<BoardCardView> = {}): BoardCardView =>
  ({
    id: 'card-1',
    number: 1,
    label: 'C-1',
    title: 'Add the inbox',
    column: 'in_progress',
    source: 'manual',
    tracking: null,
    fleet: null,
    design: null,
    round: round('running'),
    prNumber: null,
    prUrl: null,
    prState: null,
    collectState: 'none',
    collectError: null,
    needsPerson: false,
    needsPersonReason: null,
    mergedAt: null,
    autoRunFailure: null,
    movedAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    ...extra,
  }) as unknown as BoardCardView;

const context = (extra: Partial<InboxCardContext> = {}): InboxCardContext => ({
  projectId: 'p1',
  projectName: 'widget',
  branch: 'agentdock/c-1',
  revisions: [],
  demo: null,
  ...extra,
});

const kinds = (view: BoardCardView, extra: Partial<InboxCardContext> = {}) =>
  inboxCardItems(view, context(extra)).map((item) => item.kind);

const question = {
  text: 'Which database?',
  options: [{ label: 'Postgres' }],
} as unknown as NonNullable<CardRoundBrief['pendingQuestion']>;

const finishedWithPr = (extra: Partial<BoardCardView> = {}) =>
  card({
    column: 'finished',
    round: round('finished'),
    prNumber: 7,
    prUrl: 'https://github.com/acme/widget/pull/7',
    prState: 'open',
    collectState: 'ok',
    ...extra,
  });

describe('inboxCardItems (C-390)', () => {
  it('a running card without a question raises nothing', () => {
    expect(kinds(card())).toEqual([]);
  });

  it("a round's question screen is a question item, since it started waiting", () => {
    const items = inboxCardItems(
      card({
        round: round('waiting', {
          waitingAt: '2026-10-22T09:00:00.000Z',
          pendingQuestion: question,
        }),
      }),
      context(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'question:card-1',
      kind: 'question',
      projectId: 'p1',
      projectName: 'widget',
      since: '2026-10-22T09:00:00.000Z',
    });
  });

  it('a Finished card with an open pull request waits for Merge', () => {
    const demo = {
      status: 'ready' as const,
      contentUrl: '/projects/p1/attachments/a1/content',
      durationMs: 42_000,
    };
    const items = inboxCardItems(finishedWithPr(), context({ demo }));
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'merge',
        since: '2026-10-20T10:00:00.000Z',
        demo,
      }),
    ]);
  });

  it('a merged, closed or still running Finished card does not wait for Merge', () => {
    expect(kinds(finishedWithPr({ mergedAt: '2026-10-22T00:00:00Z' }))).toEqual(
      [],
    );
    expect(kinds(finishedWithPr({ prState: 'closed' }))).toEqual([]);
    expect(kinds(finishedWithPr({ round: round('running') }))).toEqual([]);
    expect(kinds(finishedWithPr({ prNumber: null, prUrl: null }))).toEqual([]);
  });

  it('a Finished card whose CI fixes ran out needs a person instead of Merge', () => {
    const items = inboxCardItems(
      finishedWithPr({
        needsPerson: true,
        needsPersonReason: 'ci_still_failing',
      }),
      context(),
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'failed',
        reason: 'ci_still_failing',
        retry: 'run',
      }),
    ]);
  });

  it('a needs-person card without a known reason still raises one item', () => {
    expect(
      inboxFailureOf(
        finishedWithPr({ needsPerson: true, needsPersonReason: null }),
        'agentdock/c-1',
      )?.reason,
    ).toBe('needs_person');
  });

  it('a failed collect is retried by collecting again, unless the worktree is gone', () => {
    const failed = card({
      column: 'finished',
      round: round('finished'),
      collectState: 'failed',
      collectError: 'push rejected',
    });
    expect(inboxFailureOf(failed, 'agentdock/c-1')).toEqual({
      reason: 'collect_failed',
      message: 'push rejected',
      retry: 'collect',
      at: null,
    });
    expect(inboxFailureOf(failed, null)?.retry).toBeNull();
    expect(
      inboxFailureOf(
        card({
          column: 'finished',
          round: round('finished'),
          collectState: 'failed',
          collectError: 'card x not found on the runner: it has no worktree',
        }),
        'agentdock/c-1',
      )?.retry,
    ).toBeNull();
  });

  it('a failed round in In progress is retried by running again', () => {
    expect(inboxFailureOf(card({ round: round('failed') }), null)).toEqual({
      reason: 'round_failed',
      message: null,
      retry: 'run',
      at: null,
    });
  });

  it('a refused auto-run waits since it was refused', () => {
    const items = inboxCardItems(
      card({
        column: 'todo',
        round: null,
        autoRunFailure: {
          code: 'unknown',
          message: 'runner offline',
          at: '2026-10-23T08:00:00.000Z',
        },
      }),
      context(),
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'failed',
        reason: 'auto_run_failed',
        message: 'runner offline',
        retry: 'run',
        since: '2026-10-23T08:00:00.000Z',
      }),
    ]);
  });

  it('nothing fails while a worker is on the card', () => {
    expect(
      inboxFailureOf(
        card({ needsPerson: true, round: round('running') }),
        null,
      ),
    ).toBeNull();
  });

  it('a design under review waits for approval, since its newest revision', () => {
    const revisions = [
      { id: 'r1', createdAt: '2026-10-21T00:00:00.000Z' },
      { id: 'r2', createdAt: '2026-10-22T00:00:00.000Z' },
    ] as unknown as DesignRevisionView[];
    const design = {
      needed: true,
      status: 'reviewing',
      approvedRevisionId: null,
    } as unknown as BoardCardView['design'];
    const items = inboxCardItems(
      card({ column: 'todo', round: null, design }),
      context({ revisions }),
    );
    expect(items).toEqual([
      expect.objectContaining({
        id: 'design:card-1',
        kind: 'design',
        since: '2026-10-22T00:00:00.000Z',
        revisions,
      }),
    ]);
    expect(
      kinds(
        card({
          column: 'todo',
          round: null,
          design: { ...design, status: 'generating' } as typeof design,
        }),
      ),
    ).toEqual([]);
  });

  it('fleet, suggestion and completed cards raise nothing', () => {
    const waiting = { round: round('waiting', { pendingQuestion: question }) };
    expect(kinds(card({ ...waiting, source: 'fleet' }))).toEqual([]);
    expect(kinds(card({ ...waiting, column: 'inbox' }))).toEqual([]);
    expect(kinds(finishedWithPr({ column: 'completed' }))).toEqual([]);
  });
});

describe('sortInboxItems and inboxCounts', () => {
  it('sorts oldest first, ties by id', () => {
    const sorted = sortInboxItems([
      { id: 'b', since: '2026-10-22T00:00:00Z' },
      { id: 'c', since: '2026-10-21T00:00:00Z' },
      { id: 'a', since: '2026-10-22T00:00:00Z' },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('counts every kind, zero included', () => {
    expect(
      inboxCounts([{ kind: 'merge' }, { kind: 'merge' }, { kind: 'setup' }]),
    ).toEqual({
      design: 0,
      question: 0,
      merge: 2,
      failed: 0,
      permission: 0,
      setup: 1,
    });
  });
});
