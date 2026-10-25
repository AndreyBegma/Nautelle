import { describe, expect, test } from 'bun:test';
import type { BoardCardView, CardPullRequestView } from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultAcceptOptions } from '../../lib/board/accept';
import { AcceptBody, UnlandedBanner } from './accept-dialog';

describe('Accept dialog, work not in the base (#709)', () => {
  test('names the missing landing and what confirming means', () => {
    const html = renderToStaticMarkup(
      <UnlandedBanner reason="C-7’s pull request #77 into develop has not merged, so its work is not in develop yet" />,
    );
    expect(html).toContain('Its work is not in the base');
    expect(html).toContain('#77 into develop has not merged');
    expect(html).toContain(
      'Accept anyway only if this work is not meant to land',
    );
  });
});

const pr = (patch: Partial<CardPullRequestView> = {}): CardPullRequestView => ({
  number: 77,
  url: 'https://github.com/o/r/pull/77',
  state: 'open',
  headSha: 'a'.repeat(40),
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  checks: 'green',
  method: 'squash',
  canMerge: true,
  ...patch,
});

const card = (patch: Partial<BoardCardView> = {}): BoardCardView =>
  ({
    label: 'C-7',
    title: 'Ship the thing',
    source: 'manual',
    issueNumber: 12,
    prNumber: 77,
    prTarget: { branch: 'develop', stackedOn: null },
    ...patch,
  }) as BoardCardView;

function body(
  over: {
    card?: BoardCardView;
    pr?: CardPullRequestView | null;
    path?: 'merge' | 'no_merge';
    kind?: 'merge' | 'already_merged' | 'accept_only';
    closePr?: boolean;
    gate?: 'ok' | 'outdated' | 'disabled';
  } = {},
) {
  const c = over.card ?? card();
  const kind = over.kind ?? 'merge';
  const options = { ...defaultAcceptOptions(c), closePr: !!over.closePr };
  const choice =
    kind === 'accept_only'
      ? ({ kind, reason: 'Nothing here.' } as const)
      : ({ kind, headSha: 'a'.repeat(40) } as const);
  return renderToStaticMarkup(
    <AcceptBody
      card={c}
      pr={over.pr === undefined ? pr() : over.pr}
      choice={choice}
      path={kind === 'merge' ? (over.path ?? 'merge') : 'no_merge'}
      options={options}
      gate={over.gate ?? 'ok'}
      canClose={!!over.pr || over.pr === undefined}
      closing={!!over.closePr}
      busy={false}
      onPath={() => {}}
      onOptions={() => {}}
    />,
  );
}

describe('Accept dialog body (#969)', () => {
  test('a mergeable PR shows the selector and only the merge option', () => {
    const html = body();
    expect(html).toContain('Accept without merging');
    expect(html).toContain('Delete the branch on GitHub');
    expect(html).not.toContain('Leave the PR open');
    expect(html).not.toContain('Close the PR');
  });

  test('switching to no-merge swaps the options', () => {
    const html = body({ path: 'no_merge' });
    expect(html).not.toContain('Delete the branch on GitHub');
    expect(html).toContain('Leave the PR open');
    expect(html).toContain('Close the PR and delete its branch');
    expect(html).not.toContain('Close the issue as not planned');
  });

  test('the issue option shows only when close is picked and there is an issue', () => {
    expect(body({ path: 'no_merge', closePr: true })).toContain(
      'Close the issue as not planned',
    );
    expect(
      body({
        path: 'no_merge',
        closePr: true,
        card: card({ issueNumber: null }),
      }),
    ).not.toContain('Close the issue as not planned');
  });

  test('a single path shows no selector', () => {
    for (const kind of ['already_merged', 'accept_only'] as const) {
      const html = body({ kind });
      expect(html).not.toContain('What Accept does');
      expect(html).not.toContain('Delete the branch on GitHub');
    }
    expect(body({ kind: 'accept_only' })).toContain('Nothing to merge here');
    expect(body({ kind: 'already_merged' })).toContain('Already merged');
  });

  test('a terminal card keeps its branch', () => {
    const terminal = card({ source: 'terminal' });
    expect(body({ card: terminal })).toContain('is kept');
    const html = body({ card: terminal, path: 'no_merge' });
    expect(html).toContain('Close the PR');
    expect(html).not.toContain('Close the PR and delete its branch');
  });

  test('an outdated runner shows the cleanup hint', () => {
    expect(body({ gate: 'outdated' })).toContain('Update the runner');
    expect(body({ gate: 'outdated', path: 'no_merge' })).toContain(
      'Update the runner',
    );
  });

  test('the PR block shows title, base, method, checks and conflicts', () => {
    const html = body({ pr: pr({ mergeable: 'CONFLICTING' }) });
    expect(html).toContain('PR #77');
    expect(html).toContain('Ship the thing');
    expect(html).toContain('develop');
    expect(html).toContain('Squash and merge');
    expect(html).toContain('Checks passed');
    expect(html).toContain('Has merge conflicts');
    expect(html).not.toContain('has conflicts');
  });
});
