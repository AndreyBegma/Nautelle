'use client';

import { Card } from '@andrewbehma/glass-ui/card';
import { Select } from '@andrewbehma/glass-ui/field';
import { SectionHeader } from '@andrewbehma/glass-ui/section-header';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { Toggle } from '@andrewbehma/glass-ui/toggle';
import type {
  NotificationChannel,
  NotificationRulesView,
} from '@nautelle/shared';
import { AsyncSection } from '../../../components/prerequisites/async-section';
import { api, describeErrorHint } from '../../../lib/api';
import {
  type EmailChoice,
  emailChoice,
  emailOptions,
  emailRuleUpdate,
  type RuleRow,
  ruleRows,
  ruleSections,
  ruleUpdate,
} from '../../../lib/notifications/format';
import { useErrorToast } from '../../../lib/section/use-error-toast';
import { useSection } from '../../../lib/section/use-section';

const LINK_TELEGRAM = (
  <a href="#telegram" className="text-accent-ink underline underline-offset-2">
    Link Telegram
  </a>
);

/** The label and the two channel columns, shared by the headers and the rows. */
const RULE_GRID =
  'grid grid-cols-[minmax(0,1fr)_3rem_3.75rem] gap-x-3 sm:grid-cols-[1fr_6rem_6rem]';
/** With email (C-404): a third column from `sm`, its own line on phones. */
const RULE_GRID_EMAIL =
  'grid grid-cols-[minmax(0,1fr)_3rem_3.75rem] gap-x-3 sm:grid-cols-[1fr_6rem_6rem_11rem]';

type RuleChange =
  | { channel: NotificationChannel; value: boolean }
  | { channel: 'email'; value: EmailChoice };

export function RulesSection({
  telegramLinked,
  emailConfigured,
}: {
  telegramLinked: boolean;
  /** The server can send email: show the Email column. */
  emailConfigured: boolean;
}) {
  const rules = useSection(
    () => api<NotificationRulesView>('/notifications/rules'),
    [],
  );
  const showError = useErrorToast();
  const view = rules.data;

  const change = async (row: RuleRow, update: RuleChange) => {
    try {
      rules.setData(
        await api<NotificationRulesView>('/notifications/rules', {
          method: 'PUT',
          body:
            update.channel === 'email'
              ? emailRuleUpdate(row, update.value)
              : ruleUpdate(row, update.channel, update.value),
        }),
      );
    } catch (error) {
      showError(describeErrorHint(error));
    }
  };

  const rows = view ? ruleRows(view.rules, telegramLinked) : [];

  return (
    <Card pad="lg">
      <SectionHeader
        className="mb-4"
        title="Rules"
        description={
          <>
            Choose which kinds reach you, and where.
            {emailConfigured
              ? ' Email goes out at once or in your daily digest.'
              : null}
            {telegramLinked ? null : (
              <> {LINK_TELEGRAM} above to turn on the Telegram column.</>
            )}
          </>
        }
      />
      <AsyncSection
        section={rules}
        unavailable={{
          title: 'Your notification rules could not be loaded',
          stillWorks:
            'Notifications keep arriving with the rules you saved before.',
        }}
        isEmpty={() => false}
        empty={null}
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        {() => (
          <RuleSections
            rows={rows}
            email={emailConfigured}
            onChange={(r, update) => void change(r, update)}
          />
        )}
      </AsyncSection>
    </Card>
  );
}

function RuleSections({
  rows,
  email,
  onChange,
}: {
  rows: RuleRow[];
  email: boolean;
  onChange: (row: RuleRow, update: RuleChange) => void;
}) {
  const grid = email ? RULE_GRID_EMAIL : RULE_GRID;
  return (
    <div className="flex flex-col gap-6">
      {ruleSections(rows).map((section) => (
        <section key={section.group} aria-labelledby={`rules-${section.group}`}>
          <div className={`${grid} items-end border-b border-line pb-2`}>
            <h3
              id={`rules-${section.group}`}
              className="text-sm font-semibold text-ink"
            >
              {section.label}
            </h3>
            <span className="text-xs text-ink-3">In-app</span>
            <span className="text-xs text-ink-3">Telegram</span>
            {email ? (
              <span className="hidden text-xs text-ink-3 sm:block">Email</span>
            ) : null}
          </div>
          <ul className="divide-y divide-line">
            {section.rows.map((row) => (
              <RuleLine
                key={row.kind}
                row={row}
                grid={grid}
                email={email}
                onChange={onChange}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RuleLine({
  row,
  grid,
  email,
  onChange,
}: {
  row: RuleRow;
  grid: string;
  email: boolean;
  onChange: (row: RuleRow, update: RuleChange) => void;
}) {
  return (
    <li className={`${grid} items-center gap-y-0.5 py-3`}>
      {/* Phones: the example spans the row under the toggles (R4). */}
      <span
        id={`rule-${row.kind}`}
        title={`From ${row.source}`}
        className="col-start-1 row-start-1 min-w-0 text-sm"
      >
        {row.label}
      </span>
      <span className="text-ink-3 col-span-3 row-start-2 text-xs sm:col-span-1">
        e.g. {row.example}
      </span>
      <div className="col-start-2 row-start-1 sm:row-span-2">
        <span id={`rule-${row.kind}-inapp`} className="sr-only">
          {row.label}, in-app
        </span>
        {row.inAppDisabled ? (
          <span className="text-ink-3 text-xs">—</span>
        ) : (
          <Toggle
            checked={row.inApp}
            onChange={(value) => onChange(row, { channel: 'inApp', value })}
            labelledBy={`rule-${row.kind}-inapp`}
          />
        )}
      </div>
      <div className="col-start-3 row-start-1 sm:row-span-2">
        <span id={`rule-${row.kind}-telegram`} className="sr-only">
          {row.label}, Telegram
        </span>
        {row.telegramNote === 'in-app only' ? (
          <span className="text-ink-3 text-xs" title="In-app only">
            In-app only
          </span>
        ) : row.telegramDisabled ? (
          <span
            className="inline-flex opacity-50"
            inert
            title="Link Telegram first"
          >
            <Toggle
              checked={row.telegram}
              onChange={() => {}}
              labelledBy={`rule-${row.kind}-telegram`}
            />
          </span>
        ) : (
          <Toggle
            checked={row.telegram}
            onChange={(value) => onChange(row, { channel: 'telegram', value })}
            labelledBy={`rule-${row.kind}-telegram`}
          />
        )}
      </div>
      {email ? <EmailCell row={row} onChange={onChange} /> : null}
    </li>
  );
}

/** Phones: the Email select gets its own line under the example (R4). */
function EmailCell({
  row,
  onChange,
}: {
  row: RuleRow;
  onChange: (row: RuleRow, update: RuleChange) => void;
}) {
  const id = `rule-${row.kind}-email`;
  return (
    <div className="col-span-3 row-start-3 mt-2 flex items-center gap-2 sm:col-span-1 sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:mt-0">
      <span id={id} className="text-xs text-ink-3 sm:sr-only">
        <span className="sr-only">{row.label}, </span>Email
      </span>
      {row.emailable ? (
        <Select
          aria-labelledby={id}
          className="h-8 w-full text-sm"
          value={emailChoice(row)}
          onChange={(event) =>
            onChange(row, {
              channel: 'email',
              value: event.target.value as EmailChoice,
            })
          }
        >
          {emailOptions(row).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <span className="text-ink-3 text-xs" title="Not sent by email">
          —
        </span>
      )}
    </div>
  );
}
