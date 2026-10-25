import { BOARD_CARD_TITLE_MAX } from '@nautelle/shared';
import type { AssistantModels } from '../assistant/assistant-models';
import type { LlmGateway } from '../llm/llm-gateway.service';
import { BoardQuickDraft, parseQuickDraft } from './board-quick-draft.service';

function service(opts: {
  model?: { provider: string; model: string } | null;
  answer?: string;
  fail?: boolean;
}) {
  const complete = jest.fn(async () => {
    if (opts.fail) throw new Error('gateway refused');
    return { text: opts.answer ?? '' };
  });
  const models = {
    cheapest: jest.fn(async () =>
      opts.model === undefined
        ? { provider: 'anthropic', model: 'haiku' }
        : opts.model,
    ),
  };
  const draft = new BoardQuickDraft(
    models as unknown as AssistantModels,
    { complete } as unknown as LlmGateway,
  );
  return { draft, complete };
}

describe('BoardQuickDraft.draft', () => {
  it('uses the model answer', async () => {
    const { draft, complete } = service({
      answer: '{"title":"Fix the login redirect","kind":"bug"}',
    });
    await expect(
      draft.draft('u1', 'login redirect is broken'),
    ).resolves.toEqual({
      title: 'Fix the login redirect',
      kind: 'bug',
      source: 'model',
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first line without a model', async () => {
    const { draft, complete } = service({ model: null });
    await expect(draft.draft('u1', 'First line\nrest')).resolves.toEqual({
      title: 'First line',
      kind: 'feature',
      source: 'fallback',
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('falls back when the gateway throws', async () => {
    const { draft } = service({ fail: true });
    expect((await draft.draft('u1', 'Add dark mode')).source).toBe('fallback');
  });

  it('falls back on an answer out of contract', async () => {
    const { draft } = service({ answer: '{"kind":"bug"}' });
    await expect(draft.draft('u1', 'Add dark mode')).resolves.toEqual({
      title: 'Add dark mode',
      kind: 'feature',
      source: 'fallback',
    });
  });

  it('sends only the first 4000 characters to the model', async () => {
    const { draft, complete } = service({ answer: '{"title":"Long"}' });
    await draft.draft('u1', 'x'.repeat(10_000));
    const call = (
      complete.mock.calls as unknown as [
        { request: { messages: { content: string }[] } },
      ][]
    )[0][0];
    expect(call.request.messages[0].content).toHaveLength(4_000);
  });
});

describe('parseQuickDraft', () => {
  it('reads a title and a kind', () => {
    expect(
      parseQuickDraft({ title: 'Fix the login redirect', kind: 'bug' }),
    ).toEqual({
      title: 'Fix the login redirect',
      kind: 'bug',
      source: 'model',
    });
  });

  it('takes a feature for any other kind', () => {
    expect(
      parseQuickDraft({ title: 'Add dark mode', kind: 'chore' })?.kind,
    ).toBe('feature');
    expect(parseQuickDraft({ title: 'Add dark mode' })?.kind).toBe('feature');
  });

  it('keeps one line, within the title limit', () => {
    const draft = parseQuickDraft({
      title: `  ${'x'.repeat(BOARD_CARD_TITLE_MAX + 50)}\nsecond line`,
      kind: 'feature',
    });
    expect(draft?.title).toHaveLength(BOARD_CARD_TITLE_MAX);
  });

  it('refuses an answer out of contract', () => {
    expect(parseQuickDraft(null)).toBeNull();
    expect(parseQuickDraft('title')).toBeNull();
    expect(parseQuickDraft({ kind: 'bug' })).toBeNull();
    expect(parseQuickDraft({ title: '   ', kind: 'bug' })).toBeNull();
  });
});
