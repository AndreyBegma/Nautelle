'use client';

import { Section } from '@andrewbehma/glass-ui/section';
import type { InboxItemView } from '@nautelle/shared';
import type { InboxGroup as Group } from '../../lib/inbox/format';
import { useActionRequestDecisions } from '../approvals/action-requests';
import { type CardActions, useCardActions } from '../board/use-card-actions';
import {
  DesignRow,
  FailedRow,
  MergeRow,
  PermissionRow,
  QuestionRow,
  SetupRow,
} from './inbox-items';

const noop = () => {};

/**
 * One project's items (C-390): the card actions and the request decisions are
 * a project's, so each group owns its hooks and renders their dialogs once.
 */
export function InboxGroup({
  group,
  now,
  isAdmin,
  onChanged,
}: {
  group: Group;
  now: number;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const actions = useCardActions({
    projectId: group.projectId,
    onChanged,
    onDeleted: noop,
  });
  const decisions = useActionRequestDecisions(group.projectId, onChanged);

  return (
    <Section title={group.projectName} headingLevel={2} pad="none">
      <ul className="divide-y divide-line px-4">
        {group.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            now={now}
            isAdmin={isAdmin}
            actions={actions}
            decisions={decisions}
            onChanged={onChanged}
          />
        ))}
      </ul>
      {actions.dialogs}
      {decisions.dialogs}
    </Section>
  );
}

function ItemRow({
  item,
  now,
  isAdmin,
  actions,
  decisions,
  onChanged,
}: {
  item: InboxItemView;
  now: number;
  isAdmin: boolean;
  actions: CardActions;
  decisions: ReturnType<typeof useActionRequestDecisions>;
  onChanged: () => void;
}) {
  switch (item.kind) {
    case 'design':
      return <DesignRow item={item} now={now} onChanged={onChanged} />;
    case 'question':
      return <QuestionRow item={item} now={now} />;
    case 'merge':
      return (
        <MergeRow
          item={item}
          now={now}
          actions={actions}
          onChanged={onChanged}
        />
      );
    case 'failed':
      return <FailedRow item={item} now={now} actions={actions} />;
    case 'permission':
      return (
        <PermissionRow
          item={item}
          now={now}
          ask={decisions.ask}
          busy={decisions.busy}
        />
      );
    case 'setup':
      return <SetupRow item={item} now={now} isAdmin={isAdmin} />;
  }
}
