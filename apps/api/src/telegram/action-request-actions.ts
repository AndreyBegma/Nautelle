import type { ToolRuleScope } from '@nautelle/shared';
import { fitsInt8 } from './callback-data';
import type { InlineKeyboardButton } from './telegram-client';

/**
 * Spec 201 D18: the Approve / Deny buttons of an `action.requested`
 * message, and the bot's fixed answers. Pure — `TelegramActionRequestService`
 * does the checks and the calls. C-401: a `tool_use` request that may be
 * remembered also gets "Allow similar in this session" and "Always allow in
 * this project".
 */

export type ActionRequestPressAction = 'approve' | 'deny';

export interface ActionRequestPress {
  action: ActionRequestPressAction;
  /** C-401: an approval that also stores a rule for this scope. */
  remember?: ToolRuleScope;
  /** The `action.requested` notification the message was sent for. */
  notificationId: bigint;
  actionRequestId: string;
}

type PressCode = 'x' | 'y' | 'xs' | 'xp';

const codeOf = (press: Pick<ActionRequestPress, 'action' | 'remember'>) =>
  press.action === 'deny'
    ? 'y'
    : press.remember === 'session'
      ? 'xs'
      : press.remember === 'project'
        ? 'xp'
        : 'x';

const PRESSES: Record<
  PressCode,
  Pick<ActionRequestPress, 'action' | 'remember'>
> = {
  x: { action: 'approve' },
  y: { action: 'deny' },
  xs: { action: 'approve', remember: 'session' },
  xp: { action: 'approve', remember: 'project' },
};

/**
 * `x:<notification id>:<action request id>`; `y` denies, `xs` and `xp`
 * approve and remember for the session or the project. ≤ 64 bytes.
 */
const CALLBACK = /^(x|y|xs|xp):(\d{1,19}):([A-Za-z0-9_-]{1,40})$/;

export const encodeActionRequestCallback = (press: ActionRequestPress) =>
  `${codeOf(press)}:${press.notificationId}:${press.actionRequestId}`;

/** Null for anything that is not an action-request button. */
export const decodeActionRequestCallback = (
  data: string | undefined,
): ActionRequestPress | null => {
  const match = data ? CALLBACK.exec(data) : null;
  if (!match || !fitsInt8(match[2])) return null;
  return {
    ...PRESSES[match[1] as PressCode],
    notificationId: BigInt(match[2]),
    actionRequestId: match[3],
  };
};

/** Whether a callback belongs to the action-request buttons. */
export const isActionRequestCallback = (data: string | undefined): boolean =>
  typeof data === 'string' && /^(x|y|xs|xp):/.test(data);

export const actionRequestKeyboard = (target: {
  notificationId: bigint;
  actionRequestId: string;
  /** C-401: the scopes the request may be remembered for; none by default. */
  remember?: readonly ToolRuleScope[];
}): InlineKeyboardButton[][] => {
  const { remember = [], ...request } = target;
  const scoped: InlineKeyboardButton[][] = (
    [
      ['session', 'Allow similar in this session'],
      ['project', 'Always allow in this project'],
    ] as const
  )
    .filter(([scope]) => remember.includes(scope))
    .map(([scope, text]) => [
      {
        text,
        callback_data: encodeActionRequestCallback({
          ...request,
          action: 'approve',
          remember: scope,
        }),
      },
    ]);
  return [
    [
      {
        text: 'Approve',
        callback_data: encodeActionRequestCallback({
          ...request,
          action: 'approve',
        }),
      },
      {
        text: 'Deny',
        callback_data: encodeActionRequestCallback({
          ...request,
          action: 'deny',
        }),
      },
    ],
    ...scoped,
  ];
};

/** Why a press was refused before the action-request service was called. */
export type ActionRequestRefusal =
  | 'invalid_button'
  | 'not_linked'
  | 'unknown_message'
  | 'inactive_user'
  | 'not_member'
  | 'role';

const REFUSALS: Record<ActionRequestRefusal, string> = {
  invalid_button: 'This button is no longer valid. Decide in Nautelle.',
  not_linked: 'This chat is not linked to Nautelle.',
  unknown_message:
    'This message is not one Nautelle can act on any more. Decide in Nautelle.',
  inactive_user: 'Your Nautelle account is not active.',
  not_member: 'You are not a member of this project any more.',
  role: 'Only an operator or an admin of this project can decide this request.',
};

export const actionRequestRefusalText = (reason: ActionRequestRefusal) =>
  REFUSALS[reason];

/** The service's refusal, in the bot's words. */
export const actionRequestErrorText = (code: string | null): string => {
  switch (code) {
    case 'not_pending':
      return 'This request was already decided, or it expired.';
    case 'self_approval':
      return 'You cannot approve your own request. Another operator or an admin has to.';
    case 'not_found':
      return 'This request is not in Nautelle any more.';
    case 'not_rememberable':
      return 'This call cannot be remembered. Approve it once, or decide in Nautelle.';
    default:
      return 'The decision could not be recorded. Try again, or decide in Nautelle.';
  }
};

/** The answer once decided; an approval that failed to execute says so. */
export const actionRequestDecidedText = (
  action: ActionRequestPressAction,
  status: string,
  failure: string | null,
  remember?: ToolRuleScope,
): string => {
  if (action === 'deny') return 'Denied.';
  if (status === 'approved' && remember === 'session') {
    return 'Approved. Similar calls in this session are allowed from now on.';
  }
  if (status === 'approved' && remember === 'project') {
    return 'Approved. Similar calls in this project are allowed until the rule is removed in Settings.';
  }
  if (status === 'failed' && failure === 'head_moved') {
    return 'Not approved: the pull request has new commits since this request. Ask for a new one.';
  }
  if (status === 'failed') {
    return `Approved, but it could not be carried out${failure ? `: ${failure}` : ''}.`;
  }
  return status === 'executed' ? 'Approved and carried out.' : 'Approved.';
};
