'use client';

import { Section } from '@andrewbehma/glass-ui/section';
import { toast } from '@andrewbehma/glass-ui/toast';
import { Toggle } from '@andrewbehma/glass-ui/toggle';
import type {
  TokenSaverFilterFamily,
  TokenSaverSettingsView,
  TokenSaverSummary,
} from '@nautelle/shared';
import { useMemo, useState } from 'react';
import { formatNumber } from '../../lib/format';
import { useErrorToast } from '../../lib/section/use-error-toast';
import { useSection } from '../../lib/section/use-section';
import {
  fetchTokenSaver,
  patchTokenSaver,
} from '../../lib/token-saver/actions';
import {
  describeTokenSaverError,
  FILTER_FAMILY_LABEL,
  formatSavedTokens,
  formatSavedUsd,
} from '../../lib/token-saver/format';
import { familySavings } from '../../lib/token-saver/summary';
import { AsyncSection } from '../prerequisites/async-section';

/** The list with `family` switched on or off, in the order the API keeps. */
const withFamily = (
  off: readonly TokenSaverFilterFamily[],
  family: TokenSaverFilterFamily,
  on: boolean,
): TokenSaverFilterFamily[] =>
  on ? off.filter((f) => f !== family) : [...off, family];

/**
 * C-442 "UI": the Token saver page's Filter families section — one Toggle per
 * family (on filters, off passes its commands through as `none:off`), with
 * what the family saved in the range beside it. A project admin switches; a
 * runner without `filterFamiliesOff` gets a line that the switch waits for
 * its update. It loads and fails on its own.
 */
export function FilterFamiliesSection({
  projectId,
  summary,
  isAdmin,
}: {
  projectId: string;
  /** The page's summary for the range; `null` or absent shows no figures. */
  summary: TokenSaverSummary | null | undefined;
  isAdmin: boolean;
}) {
  const section = useSection(() => fetchTokenSaver(projectId), [projectId]);
  const showError = useErrorToast();
  const [busy, setBusy] = useState<TokenSaverFilterFamily | null>(null);

  const toggle = async (
    view: TokenSaverSettingsView,
    family: TokenSaverFilterFamily,
    on: boolean,
  ) => {
    setBusy(family);
    try {
      const next = await patchTokenSaver(projectId, {
        filtersOff: withFamily(view.filtersOff, family, on),
      });
      section.setData(next);
      toast.success(
        `${FILTER_FAMILY_LABEL[family].name} switched ${on ? 'on' : 'off'}. It applies from the next launch.`,
      );
    } catch (err) {
      showError(describeTokenSaverError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Filter families"
      description="Each family filters the output of the commands it covers. A family switched off lets them through whole, counted as “Filter switched off for this launch”. Judge a switch by Cost per round below: the week a family goes off is the week its effect shows. Saved figures are ≈ estimates for this range."
      surface="none"
      pad="none"
    >
      <AsyncSection
        section={section}
        unavailable={{
          title: 'The filter families are not answering',
          stillWorks: 'The rest of the page still loads.',
        }}
        empty={null}
      >
        {(view) => (
          <FilterFamilyList
            view={view}
            summary={summary}
            isAdmin={isAdmin}
            busy={busy}
            onToggle={(family, on) => void toggle(view, family, on)}
          />
        )}
      </AsyncSection>
    </Section>
  );
}

/**
 * The families with their switches and figures. Toggles stay inert for a
 * member who is not an admin and while a switch is saving.
 */
export function FilterFamilyList({
  view,
  summary,
  isAdmin,
  busy,
  onToggle,
}: {
  view: TokenSaverSettingsView;
  summary: TokenSaverSummary | null | undefined;
  isAdmin: boolean;
  busy: TokenSaverFilterFamily | null;
  onToggle: (family: TokenSaverFilterFamily, on: boolean) => void;
}) {
  const saved = useMemo(
    () => familySavings(summary?.byFilter ?? []),
    [summary],
  );
  const locked = !isAdmin || busy !== null;
  return (
    <div className="flex flex-col gap-3">
      {view.filtersOffSupported ? null : (
        <p className="text-ink-3 text-sm">
          This project's runner does not switch families off yet. A switch saved
          here takes effect after the runner update.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {saved.map((figures) => {
          const { family } = figures;
          const label = FILTER_FAMILY_LABEL[family];
          const labelId = `filter-family-${family}`;
          return (
            <li
              key={family}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1"
            >
              <div className="flex items-start gap-3">
                {/* glass-ui's Toggle has no `disabled`: a locked one is inert and dimmed. */}
                <span
                  aria-disabled={locked || undefined}
                  inert={locked || undefined}
                  className={locked ? 'opacity-60' : undefined}
                >
                  <Toggle
                    labelledBy={labelId}
                    checked={!view.filtersOff.includes(family)}
                    onChange={(value) => {
                      if (!locked) onToggle(family, value);
                    }}
                  />
                </span>
                <span className="flex flex-col">
                  <span id={labelId} className="text-sm">
                    {label.name}
                  </span>
                  <span className="text-ink-3 text-xs">{label.covers}</span>
                </span>
              </div>
              <span className="num text-ink-2 text-sm">
                {figures.commands > 0
                  ? [
                      `${formatSavedTokens(figures.estimateTokens)} saved`,
                      formatSavedUsd(figures.estimateUsd),
                      `${formatNumber(figures.commands, 0)} commands`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Nothing filtered in this range'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
