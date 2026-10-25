import {
  actionRequestIdOfLink,
  actionRequestLink,
} from '../local/action-request-mapper';
import {
  actionRequestDecidedText,
  actionRequestErrorText,
  actionRequestKeyboard,
  decodeActionRequestCallback,
  encodeActionRequestCallback,
  isActionRequestCallback,
} from './action-request-actions';
import { decodeCallback } from './approval-actions';

const ID = 'cmv84f8yx00ofd5j6crmj2ivw';

describe('action-request buttons (spec 201 D18)', () => {
  it('round-trips `x|y:<notification>:<request>` within 64 bytes', () => {
    for (const action of ['approve', 'deny'] as const) {
      const press = {
        action,
        notificationId: 9_223_372_036_854_775_807n,
        actionRequestId: ID,
      };
      const data = encodeActionRequestCallback(press);
      expect(data.startsWith(action === 'approve' ? 'x:' : 'y:')).toBe(true);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(decodeActionRequestCallback(data)).toEqual(press);
      expect(isActionRequestCallback(data)).toBe(true);
      // The PR buttons' decoder never takes it.
      expect(decodeCallback(data)).toBeNull();
    }
  });

  it('round-trips the remembered approvals as `xs`/`xp` within 64 bytes (C-401)', () => {
    for (const [remember, code] of [
      ['session', 'xs:'],
      ['project', 'xp:'],
    ] as const) {
      const press = {
        action: 'approve' as const,
        remember,
        notificationId: 9_223_372_036_854_775_807n,
        actionRequestId: 'A'.repeat(40),
      };
      const data = encodeActionRequestCallback(press);
      expect(data.startsWith(code)).toBe(true);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(decodeActionRequestCallback(data)).toEqual(press);
      expect(isActionRequestCallback(data)).toBe(true);
      expect(decodeCallback(data)).toBeNull();
    }
    // A deny never remembers.
    expect(
      encodeActionRequestCallback({
        action: 'deny',
        remember: 'project',
        notificationId: 1n,
        actionRequestId: ID,
      }),
    ).toBe(`y:1:${ID}`);
  });

  it('offers the rule buttons only for the scopes given (C-401)', () => {
    const target = { notificationId: 7n, actionRequestId: ID };
    const texts = (rows: { text: string }[][]) =>
      rows.map((row) => row.map((button) => button.text));
    expect(texts(actionRequestKeyboard(target))).toEqual([['Approve', 'Deny']]);
    const both = actionRequestKeyboard({
      ...target,
      remember: ['session', 'project'],
    });
    expect(texts(both)).toEqual([
      ['Approve', 'Deny'],
      ['Allow similar in this session'],
      ['Always allow in this project'],
    ]);
    expect(both[1]?.[0]?.callback_data).toBe(`xs:7:${ID}`);
    expect(both[2]?.[0]?.callback_data).toBe(`xp:7:${ID}`);
    expect(
      texts(actionRequestKeyboard({ ...target, remember: ['project'] })),
    ).toEqual([['Approve', 'Deny'], ['Always allow in this project']]);
  });

  it('answers a remembered approval and a refused one (C-401)', () => {
    expect(
      actionRequestDecidedText('approve', 'approved', null, 'session'),
    ).toBe('Approved. Similar calls in this session are allowed from now on.');
    expect(
      actionRequestDecidedText('approve', 'approved', null, 'project'),
    ).toContain('removed in Settings');
    expect(actionRequestErrorText('not_rememberable')).toContain(
      'cannot be remembered',
    );
  });

  it('decodes nothing it did not encode', () => {
    for (const data of [
      undefined,
      '',
      'x:1',
      'z:1:abc',
      `x:-1:${ID}`,
      `x:1:${ID}/../`,
      `a:1:2:${'A'.repeat(27)}`,
      `xx:1:${ID}`,
      `ys:1:${ID}`,
    ]) {
      expect(decodeActionRequestCallback(data)).toBeNull();
    }
    expect(isActionRequestCallback(`a:1:2:${'A'.repeat(27)}`)).toBe(false);
  });

  it("carries the request id in the notification's link", () => {
    const link = actionRequestLink('prj_1', ID);
    expect(link).toBe(
      `/projects/prj_1/queue?tab=approvals&actionRequest=${ID}`,
    );
    expect(actionRequestIdOfLink(link)).toBe(ID);
    // A notification written before C-284 still names its request.
    expect(
      actionRequestIdOfLink(`/projects/prj_1/approvals?actionRequest=${ID}`),
    ).toBe(ID);
    expect(actionRequestIdOfLink('/projects/prj_1/fleet')).toBeNull();
    expect(actionRequestIdOfLink(null)).toBeNull();
  });

  it('says a moved head approved nothing (C-110)', () => {
    expect(actionRequestDecidedText('approve', 'failed', 'head_moved')).toBe(
      'Not approved: the pull request has new commits since this request. Ask for a new one.',
    );
    expect(actionRequestDecidedText('approve', 'failed', 'pr_not_open')).toBe(
      'Approved, but it could not be carried out: pr_not_open.',
    );
  });
});
