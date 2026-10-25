import { describe, expect, it } from 'bun:test';
import type { UploadItem } from '@andrewbehma/glass-ui/use-file-upload';
import { BOARD_CARD_TITLE_MAX, type BoardCardView } from '@nautelle/shared';
import { ApiError } from '../api';
import type { AttachmentUploads } from '../attachments/use-attachment-uploads';
import {
  discardUnclaimed,
  draftWithin,
  mergeQuickDraft,
  type QuickCardInput,
  quickCardReady,
  quickCardRequest,
  saveQuickCard,
} from './quick-card';

const input = (over: Partial<QuickCardInput> = {}): QuickCardInput => ({
  text: 'Fix the footer link',
  title: '',
  kind: 'feature',
  runNow: false,
  attachmentIds: [],
  ...over,
});

const card = { number: 7 } as BoardCardView;

describe('quickCardRequest', () => {
  it('keeps the title the person or the model set', () => {
    const request = quickCardRequest(input({ title: ' Footer link ' }));
    expect(request.title).toBe('Footer link');
    expect(request.body).toBe('Fix the footer link');
  });

  it('falls back to the first line when no title was written', () => {
    expect(
      quickCardRequest(input({ text: '\nFirst line\nSecond' })).title,
    ).toBe('First line');
  });

  it('cuts a title to the limit and sends the kind as set', () => {
    const request = quickCardRequest(
      input({ title: 'x'.repeat(BOARD_CARD_TITLE_MAX + 10), kind: 'bug' }),
    );
    expect(request.title).toHaveLength(BOARD_CARD_TITLE_MAX);
    expect(request.kind).toBe('bug');
  });

  it('sends attachments only when there are some', () => {
    expect('attachmentIds' in quickCardRequest(input())).toBe(false);
    expect(
      quickCardRequest(input({ attachmentIds: ['a'] })).attachmentIds,
    ).toEqual(['a']);
  });
});

describe('quickCardReady', () => {
  it('needs text and no upload in flight', () => {
    expect(quickCardReady({ text: '  ' }, false)).toBe(false);
    expect(quickCardReady({ text: 'x' }, true)).toBe(false);
    expect(quickCardReady({ text: 'x' }, false)).toBe(true);
  });
});

describe('saveQuickCard', () => {
  const calls = (run: () => Promise<unknown>) => ({
    create: async () => card,
    run: run as never,
  });

  it('only creates without Run now', async () => {
    let ran = false;
    const result = await saveQuickCard(
      'p1',
      input(),
      calls(async () => {
        ran = true;
      }),
    );
    expect(result.run).toEqual({ state: 'not_requested' });
    expect(ran).toBe(false);
  });

  it('starts the card with Run now', async () => {
    const result = await saveQuickCard(
      'p1',
      input({ runNow: true }),
      calls(async () => ({ queue: null })),
    );
    expect(result.run).toEqual({ state: 'started' });
  });

  it('reports the card queued when Run put it in the run queue', async () => {
    const result = await saveQuickCard(
      'p1',
      input({ runNow: true }),
      calls(async () => ({ queue: { position: 1 } })),
    );
    expect(result.run).toEqual({ state: 'waiting' });
  });

  it('keeps the card waiting when the project has no free slot', async () => {
    const result = await saveQuickCard(
      'p1',
      input({ runNow: true }),
      calls(async () => {
        throw new ApiError(
          409,
          'max_running' as ApiError['code'],
          '3 of 3 card workers are running in this project',
        );
      }),
    );
    expect(result.card).toBe(card);
    expect(result.run).toEqual({ state: 'waiting' });
  });

  it('keeps the card and says why another refusal stopped the run', async () => {
    const result = await saveQuickCard(
      'p1',
      input({ runNow: true }),
      calls(async () => {
        throw new ApiError(409, 'budget_exceeded' as ApiError['code'], 'Over');
      }),
    );
    expect(result.card).toBe(card);
    expect(result.run.state).toBe('refused');
  });
});

describe('mergeQuickDraft', () => {
  const fields = { title: '', kind: 'feature' as const };
  const draft = { title: 'Fix footer link', kind: 'bug' as const };

  it('saves the drafted title and kind when Enter waited for the draft', () => {
    expect(
      mergeQuickDraft(fields, { title: false, kind: false }, draft),
    ).toEqual(draft);
  });

  it('keeps a field the person wrote', () => {
    expect(
      mergeQuickDraft(
        { title: 'Mine', kind: 'feature' },
        { title: true, kind: false },
        draft,
      ),
    ).toEqual({ title: 'Mine', kind: 'bug' });
  });

  it('keeps the form when no draft arrived', () => {
    expect(
      mergeQuickDraft(fields, { title: false, kind: false }, null),
    ).toEqual(fields);
  });
});

describe('draftWithin', () => {
  const draft = { title: 'Fix footer link', kind: 'bug' as const };

  it('passes a draft that arrives in time', async () => {
    expect(await draftWithin(Promise.resolve(draft), 50)).toEqual(draft);
  });

  it('gives up on a slow draft so Save is not held up', async () => {
    const slow = new Promise<typeof draft>(() => {});
    const started = Date.now();
    expect(await draftWithin(slow, 20)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('discardUnclaimed', () => {
  it('drops every upload a cancelled Quick card left, so the next open starts empty', () => {
    const items = [
      { id: 'a', state: { status: 'done', response: { id: 'att-1' } } },
      { id: 'b', state: { status: 'uploading', loaded: 1, total: 2 } },
    ] as UploadItem[];
    const dropped: string[] = [];
    discardUnclaimed({
      upload: { items } as AttachmentUploads['upload'],
      discard: (item) => dropped.push(item.id),
    });
    expect(dropped).toEqual(['a', 'b']);
  });

  it('does nothing once a save forgot its claimed uploads', () => {
    const dropped: string[] = [];
    discardUnclaimed({
      upload: { items: [] as UploadItem[] } as AttachmentUploads['upload'],
      discard: (item) => dropped.push(item.id),
    });
    expect(dropped).toEqual([]);
  });
});
