'use client';

import { ConfirmDialog } from '@andrewbehma/glass-ui/confirm-dialog';
import { Section } from '@andrewbehma/glass-ui/section';
import { Skeleton } from '@andrewbehma/glass-ui/skeleton';
import { toast } from '@andrewbehma/glass-ui/toast';
import { Toggle } from '@andrewbehma/glass-ui/toggle';
import type {
  ProjectLabelsResponse,
  ProjectLabelView,
  UpdateProjectLabelRequest,
} from '@nautelle/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  createLabel,
  deleteLabel,
  fetchLabels,
  replaceLabelRules,
  saveLabelSwitches,
  updateLabel,
} from '../../../../../../lib/labels/actions';
import {
  deleteConsequence,
  describeLabelError,
} from '../../../../../../lib/labels/settings';
import { useErrorToast } from '../../../../../../lib/section/use-error-toast';
import { CombinesDialog } from './combines-dialog';
import { LabelList } from './label-list';
import { PathRules } from './path-rules';

/** A switch with its title and help on the left; inert for a viewer. */
function SwitchRow({
  id,
  title,
  help,
  checked,
  locked,
  onChange,
}: {
  id: string;
  title: string;
  help: string;
  checked: boolean;
  locked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-line border-t px-4 py-3 first:border-t-0">
      <div className="min-w-0">
        <p id={id} className="font-medium text-sm">
          {title}
        </p>
        <p className="mt-0.5 text-ink-3 text-xs">{help}</p>
      </div>
      <span
        aria-disabled={locked || undefined}
        inert={locked || undefined}
        className={locked ? 'opacity-60' : undefined}
      >
        <Toggle labelledBy={id} checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

/**
 * C-498 (ADR-0125): Settings → Labels — the project's labels, the ordered path
 * rules and the two automatic switches, as plain sections in that order. A
 * project admin edits them; everyone else reads.
 */
export function LabelsTab({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const [view, setView] = useState<ProjectLabelsResponse>();
  const [busy, setBusy] = useState(false);
  const [combining, setCombining] = useState<ProjectLabelView | null>(null);
  const [deleting, setDeleting] = useState<ProjectLabelView | null>(null);
  const showError = useErrorToast();

  useEffect(() => {
    let current = true;
    fetchLabels(projectId)
      .then((next) => {
        if (current) setView(next);
      })
      .catch((err) => {
        if (current) showError(describeLabelError(err));
      });
    return () => {
      current = false;
    };
  }, [projectId, showError]);

  const reload = useCallback(async () => {
    setView(await fetchLabels(projectId));
  }, [projectId]);

  /** Runs one write, then reloads the view; `false` when it failed. */
  const run = useCallback(
    async (write: () => Promise<unknown>, saved: string) => {
      setBusy(true);
      try {
        await write();
        await reload();
        toast.success(saved);
        return true;
      } catch (err) {
        showError(describeLabelError(err));
        // A refusal can mean the list changed under us: show what is true now.
        await reload().catch(() => undefined);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, showError],
  );

  if (!view) return <Skeleton className="h-64 w-full" />;

  const patch = (label: ProjectLabelView, body: UpdateProjectLabelRequest) =>
    run(() => updateLabel(projectId, label.id, body), 'Label saved.');

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Labels"
        description="A label colours the stripe of a card and its chips. Colours are the eight project hues."
        pad="none"
      >
        <LabelList
          labels={view.labels}
          cardCounts={view.cardCounts}
          isAdmin={isAdmin}
          busy={busy}
          onPatch={patch}
          onCombines={setCombining}
          onDelete={setDeleting}
          onCreate={(name, hue) =>
            run(() => createLabel(projectId, { name, hue }), 'Label added.')
          }
        />
      </Section>

      <Section
        title="Path rules"
        description="A card whose pull request changes a file matching a pattern gets the label. Rules are saved together."
        pad="none"
      >
        <PathRules
          labels={view.labels}
          rules={view.rules}
          isAdmin={isAdmin}
          busy={busy}
          onSave={(rules) =>
            run(() => replaceLabelRules(projectId, { rules }), 'Rules saved.')
          }
        />
      </Section>

      <Section title="Automatic labels" pad="none">
        <SwitchRow
          id="labels-suggest"
          title="Suggest labels on create"
          help="The cheapest model reads the title and summary."
          checked={view.suggest}
          locked={!isAdmin || busy}
          onChange={(labelSuggest) =>
            void run(
              () => saveLabelSwitches(projectId, { labelSuggest }),
              labelSuggest ? 'Suggestions are on.' : 'Suggestions are off.',
            )
          }
        />
        <SwitchRow
          id="labels-paths"
          title="Refine from pull request files"
          help="Path rules run on the changed files. Labels a person set or removed stay as they are."
          checked={view.paths}
          locked={!isAdmin || busy}
          onChange={(labelPaths) =>
            void run(
              () => saveLabelSwitches(projectId, { labelPaths }),
              labelPaths
                ? 'Labels from files are on.'
                : 'Labels from files are off.',
            )
          }
        />
      </Section>

      <CombinesDialog
        label={combining}
        labels={view.labels}
        busy={busy}
        onClose={() => setCombining(null)}
        onSave={async (label, combines) => {
          if (await patch(label, { combines })) setCombining(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? 'this label'}?`}
        consequence={
          deleting
            ? deleteConsequence(
                deleting.name,
                view.cardCounts[deleting.id] ?? 0,
              )
            : ''
        }
        verb="Delete"
        tone="danger"
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          const label = deleting;
          if (
            await run(
              () => deleteLabel(projectId, label.id),
              `${label.name} deleted.`,
            )
          ) {
            setDeleting(null);
          }
        }}
      />
    </div>
  );
}
