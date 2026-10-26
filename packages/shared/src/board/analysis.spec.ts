import { describe, expect, it } from 'bun:test';
import {
  type Capabilities,
  cardReadOnlyAvailable,
} from '../protocol/capabilities';
import { localMethods } from '../protocol/local';
import {
  ANALYSIS_REPORT_MAX,
  analysisReportSummary,
  CARD_PROPOSALS_MAX,
  cardProposalsInputSchema,
} from './analysis';
import { cardBranch } from './naming';
import { isWorkCardKind, WORK_CARD_KINDS } from './types';

const proposal = (over: Record<string, unknown> = {}) => ({
  title: 'Index the runs table by project',
  body: 'The fleet page scans every run.',
  kind: 'feature',
  ...over,
});

const finishArgs = localMethods['card.finishAnalysis'].args;

describe('card.finishAnalysis args (C-503)', () => {
  it('accepts a report with proposals that depend on earlier ones', () => {
    const parsed = finishArgs.safeParse({
      report: 'Two gaps.\n\nDetails follow.',
      proposals: [
        proposal({ labels: ['perf'] }),
        proposal({ kind: 'bug', dependsOn: [0] }),
        proposal({ kind: 'task', dependsOn: [0, 1] }),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a report with no proposals', () => {
    expect(
      finishArgs.safeParse({ report: 'Nothing to do.', proposals: [] }),
    ).toMatchObject({ success: true });
  });

  it('refuses a dependsOn naming a later, its own or a missing position', () => {
    for (const dependsOn of [[1], [0], [5]]) {
      const proposals =
        dependsOn[0] === 0
          ? [proposal({ dependsOn })]
          : [proposal({ dependsOn }), proposal()];
      expect(
        finishArgs.safeParse({ report: 'Report.', proposals }).success,
      ).toBe(false);
    }
  });

  it('refuses a repeated dependency', () => {
    expect(
      cardProposalsInputSchema.safeParse([
        proposal(),
        proposal({ dependsOn: [0, 0] }),
      ]).success,
    ).toBe(false);
  });

  it(`refuses more than ${CARD_PROPOSALS_MAX} proposals`, () => {
    const proposals = (n: number) =>
      Array.from({ length: n }, (_, i) => proposal({ title: `Task ${i}` }));
    expect(
      finishArgs.safeParse({
        report: 'Report.',
        proposals: proposals(CARD_PROPOSALS_MAX),
      }).success,
    ).toBe(true);
    expect(
      finishArgs.safeParse({
        report: 'Report.',
        proposals: proposals(CARD_PROPOSALS_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it('refuses an empty or too long report, a bad proposal and an unknown field', () => {
    for (const args of [
      { report: ' ', proposals: [] },
      { report: 'x'.repeat(ANALYSIS_REPORT_MAX + 1), proposals: [] },
      { report: 'Report.', proposals: [proposal({ kind: 'analysis' })] },
      { report: 'Report.', proposals: [proposal({ title: '' })] },
      { report: 'Report.', proposals: [proposal({ body: 'x'.repeat(8001) })] },
      {
        report: 'Report.',
        proposals: [proposal({ labels: ['a', 'b', 'c', 'd', 'e', 'f'] })],
      },
      {
        report: 'Report.',
        proposals: [proposal({ labels: ['x'.repeat(41)] })],
      },
      { report: 'Report.', proposals: [proposal({ extra: 1 })] },
      { report: 'Report.', proposals: [], summary: 'Done.' },
    ]) {
      expect(finishArgs.safeParse(args).success).toBe(false);
    }
  });

  it('carries readOnlyViolation through for the daemon to set', () => {
    const parsed = finishArgs.safeParse({
      report: 'Report.',
      proposals: [],
      readOnlyViolation: true,
    });
    expect(parsed.data?.readOnlyViolation).toBe(true);
  });

  it('answers the card number and the proposals stored', () => {
    const result = localMethods['card.finishAnalysis'].result;
    expect(
      result.safeParse({ number: 4, finished: true, proposals: 2 }).success,
    ).toBe(true);
    expect(
      result.safeParse({ number: 4, finished: false, proposals: 2 }).success,
    ).toBe(false);
  });
});

describe('analysisReportSummary', () => {
  it('is the first paragraph, trimmed and capped', () => {
    expect(
      analysisReportSummary('  Two gaps found.\n\n## Details\n', 4000),
    ).toBe('Two gaps found.');
    expect(analysisReportSummary('One\nparagraph\n \nnext', 4000)).toBe(
      'One\nparagraph',
    );
    expect(analysisReportSummary('x'.repeat(50), 10)).toBe('x'.repeat(10));
  });
});

describe('the analysis kind (C-503 D5)', () => {
  it('is not a work kind the model picks', () => {
    expect([...WORK_CARD_KINDS]).toEqual(['feature', 'bug']);
    expect(isWorkCardKind('analysis')).toBe(false);
    expect(isWorkCardKind('bug')).toBe(true);
  });

  it('works on a card/ branch even with an issue', () => {
    expect(
      cardBranch({
        kind: 'analysis',
        number: 9,
        title: 'Why is the fleet slow',
        issueNumber: 41,
      }),
    ).toBe('card/c9-why-is-the-fleet-slow');
  });

  it('is offered read-only rounds only by a runner that says so', () => {
    const caps = (cardReadOnly?: boolean) =>
      ({ cardReadOnly }) as unknown as Capabilities;
    expect(cardReadOnlyAvailable(caps(true))).toBe(true);
    expect(cardReadOnlyAvailable(caps(false))).toBe(false);
    expect(cardReadOnlyAvailable(caps())).toBe(false);
  });
});
