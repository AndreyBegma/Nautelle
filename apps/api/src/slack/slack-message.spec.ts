import { type SlackMessageParts, slackText, slackTestText } from './slack-message';

const parts = (overrides: Partial<SlackMessageParts>): SlackMessageParts => ({
  event: 'finished',
  title: 'C-12 "Add login" is finished',
  body: 'PR #77 is ready for review.',
  project: 'Widget',
  link: '/projects/p1/board?card=12',
  prUrl: 'https://github.com/acme/widget/pull/77',
  prNumber: 77,
  demo: false,
  ...overrides,
});

describe('slackText (C-405)', () => {
  it('links the title to the card and names the PR and the project', () => {
    expect(slackText(parts({}), 'https://nautelle.test')).toBe(
      [
        '*<https://nautelle.test/projects/p1/board?card=12|C-12 "Add login" is finished>*',
        'PR #77 is ready for review.',
        '<https://github.com/acme/widget/pull/77|Pull request #77>  ·  Widget',
      ].join('\n'),
    );
  });

  it('links a ready demo on the card next to the PR', () => {
    const text = slackText(
      parts({
        event: 'demo',
        title: 'The demo of C-12 "Add login" is ready',
        demo: true,
      }),
      'https://nautelle.test',
    );
    expect(text).toContain(
      '<https://github.com/acme/widget/pull/77|Pull request #77>  ·  <https://nautelle.test/projects/p1/board?card=12|Watch the demo>  ·  Widget',
    );
  });

  it('has no app links without an app URL', () => {
    const text = slackText(parts({ demo: true }), null);
    expect(text.startsWith('*C-12 "Add login" is finished*')).toBe(true);
    expect(text).not.toContain('Watch the demo');
  });

  it('escapes what Slack would read as markup', () => {
    const text = slackText(
      parts({
        title: 'C-1 "<!channel> & <b>"',
        body: 'a > b',
        project: '<p>',
        prUrl: 'https://github.com/a/b/pull/1|evil',
      }),
      null,
    );
    expect(text).toContain('*C-1 "&lt;!channel&gt; &amp; &lt;b&gt;"*');
    expect(text).toContain('a &gt; b');
    expect(text).toContain('&lt;p&gt;');
    expect(text).not.toContain('evil');
  });
});

describe('slackTestText', () => {
  it('says which projects the channel receives', () => {
    expect(slackTestText('project', 'Widget', null)).toContain('for Widget');
    expect(slackTestText('workspace', null, 'https://nautelle.test')).toContain(
      'every project without its own webhook. <https://nautelle.test|Open Nautelle>',
    );
  });
});
