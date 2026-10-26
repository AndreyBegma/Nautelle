import {
  CARD_WORKER_PROMPT_VERSION,
  cardAnalysisFeedbackPrompt,
} from '@nautelle/shared';
import { BoardWorld } from './testing/board-e2e';

/**
 * C-505 (ADR-0126): running an analysis card sends a read-only `card.run`
 * with the analysis prompt and ships nothing — no issue, spec, pull request,
 * demo, escalation or branch.
 */
describe('running an analysis card (C-505, e2e)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());
  afterEach(() => w.work.settled());

  const post = (number: number, action: string, body: object = {}) =>
    w.operator.send(
      'post',
      `${w.path()}/board/cards/${number}/${action}`,
      body,
    );

  const analysisCard = (body: Record<string, unknown> = {}) =>
    w.createCard({
      kind: 'analysis',
      title: 'Why is the fleet page slow',
      body: 'Find out.',
      ...body,
    });

  it('sends readOnly with the analysis prompt and leaves out everything a work round ships', async () => {
    await w.advertiseCardReadOnly();
    await w.ctx.prisma.project.update({
      where: { id: w.a },
      data: { codeSentinelConfig: { orchestrator: { specDir: 'docs/specs' } } },
    });
    await analysisCard({ issueOnRun: true, specOnRun: true });
    const response = await w.runCard(1);
    expect(response.status).toBe(200);

    const [sent] = w.sent('card.run');
    expect(sent).toMatchObject({ readOnly: true });
    for (const key of [
      'pullRequest',
      'newBranch',
      'startBranch',
      'demo',
      'escalate',
      'files',
    ]) {
      expect(sent).not.toHaveProperty(key);
    }
    const prompt = String(sent.prompt);
    expect(prompt).toContain('Kind: analysis (read-only)');
    expect(prompt).toContain('finish_analysis');
    expect(prompt).not.toContain('finish_card');

    expect(w.issues()).toEqual([]);
    const card = await w.card(1);
    expect(card.branch).toBeNull();
    expect(card.issueNumber).toBeNull();
    expect(card.specPath).toBeNull();
    expect(card.column).toBe('in_progress');
    const run = await w.ctx.prisma.run.findUniqueOrThrow({
      where: { id: card.rounds[0].runId },
    });
    expect(run.args).toMatchObject({
      promptVersion: CARD_WORKER_PROMPT_VERSION,
    });
  });

  it("lists the project's labels in the prompt", async () => {
    await w.advertiseCardReadOnly();
    await w.ctx.prisma.projectLabel.createMany({
      data: [
        { projectId: w.a, name: 'api', hue: 1, position: 0 },
        { projectId: w.a, name: 'web', hue: 2, position: 1 },
      ],
    });
    await analysisCard();
    await w.runCard(1);
    expect(String(w.sent('card.run')[0].prompt)).toContain('`api`, `web`');
  });

  it('refuses the Run on a runner without cardReadOnly and starts nothing', async () => {
    await analysisCard();
    const response = await w.runCard(1);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('command_unavailable');
    expect(w.sent('card.run')).toEqual([]);
    const card = await w.card(1);
    expect(card.column).toBe('todo');
    expect(card.rounds).toHaveLength(0);
    expect(card.branch).toBeNull();
  });

  it('a feedback round stays read-only and asks for replacing proposals', async () => {
    await w.advertiseCardReadOnly();
    await analysisCard();
    await w.runCard(1);
    await post(1, 'finish');
    const response = await post(1, 'feedback', {
      text: 'Look at the API too.',
    });
    expect(response.status).toBe(200);

    const card = await w.card(1);
    const [, feedback] = w.sent('card.run');
    expect(feedback).toMatchObject({
      readOnly: true,
      session: { id: card.sessionId, resume: true },
      prompt: cardAnalysisFeedbackPrompt('Look at the API too.'),
    });
    expect(feedback).not.toHaveProperty('pullRequest');
    expect(card.branch).toBeNull();
  });

  it('leaves a feature card without readOnly', async () => {
    await w.advertiseCardReadOnly();
    await w.createCard();
    await w.runCard(1);
    expect(w.sent('card.run')[0]).not.toHaveProperty('readOnly');
  });
});
