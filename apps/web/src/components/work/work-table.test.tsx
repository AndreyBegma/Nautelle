import { describe, expect, test } from 'bun:test';
import type { CardLabelView, WorkCardItem, WorkItem } from '@nautelle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { LabelStripe, LabelsSrText } from '../board/label-stripe';
import { labelsOf } from './work-table';

const label = (name: string, hue: number): CardLabelView => ({
  id: name,
  name,
  hue,
  source: 'person',
});

const card = (over: Partial<WorkCardItem> = {}): WorkCardItem => ({
  source: 'card',
  projectId: 'p1',
  projectName: 'Shop',
  cardId: 'c1',
  number: 1,
  label: 'C-1',
  title: 'Add login',
  kind: 'feature',
  column: 'todo',
  roundPhase: null,
  issueNumber: null,
  issueUrl: null,
  prNumber: null,
  prUrl: null,
  updatedAt: '2026-10-27T00:00:00.000Z',
  href: '/projects/p1/board/1',
  ...over,
});

const row = (item: WorkItem) => ({ type: 'item' as const, id: 'r', item });

describe('Work list labels (C-502)', () => {
  test('a labelled card row has its labels, in order', () => {
    const labels = [label('frontend', 1), label('backend', 3)];
    expect(labelsOf(row(card({ labels })) as never)).toEqual(labels);
  });

  test('a card without labels, and a plan task, have none', () => {
    expect(labelsOf(row(card()) as never)).toEqual([]);
    const task = {
      source: 'plan',
      projectId: 'p1',
      projectName: 'Shop',
    } as WorkItem;
    expect(labelsOf(row(task) as never)).toEqual([]);
  });

  test('the row stripe has a segment per label and the names for a screen reader', () => {
    const labels = [label('frontend', 1), label('backend', 3)];
    const html = renderToStaticMarkup(
      <>
        <LabelStripe labels={labels} inline />
        <LabelsSrText labels={labels} />
      </>,
    );
    expect(html).toContain('data-label-stripe="2"');
    expect(html.match(/data-label-segment/g)).toHaveLength(2);
    expect(html).toContain('Labels: frontend, backend');
  });

  test('no labels draws nothing', () => {
    expect(renderToStaticMarkup(<LabelStripe labels={[]} inline />)).toBe('');
  });
});
