'use client';

import { Select } from '@andrewbehma/glass-ui/field';
import { SegmentedControl } from '@andrewbehma/glass-ui/segmented-control';
import { Toolbar } from '@andrewbehma/glass-ui/toolbar';
import { INBOX_ITEM_KINDS, type InboxItemKind } from '@nautelle/shared';
import { useMemo } from 'react';
import { ScrollX } from '../../../components/scroll-x/scroll-x';
import {
  type UrlFilters,
  useFilterChips,
} from '../../../lib/filters/use-url-filters';
import {
  type InboxFilters as Filters,
  INBOX_KIND_LABEL,
  inboxChipDefs,
} from '../../../lib/inbox/format';
import { Segment } from '../workflows/segment';

/**
 * The Inbox's filter bar (C-390): the kind as a view, with how many of each
 * wait in the chosen project, and the project as an instant select.
 */
export function InboxFilters({
  url,
  projects,
  counts,
  total,
}: {
  url: UrlFilters<Filters>;
  projects: readonly { id: string; name: string }[];
  /** Items of each kind in the chosen project. */
  counts: Record<InboxItemKind, number>;
  total: number;
}) {
  const { filters, set } = url;
  const defs = useMemo(() => {
    const names = new Map(projects.map((p) => [p.id, p.name]));
    return inboxChipDefs((id) => names.get(id) ?? id);
  }, [projects]);
  const chips = useFilterChips(url, defs);

  const kinds = (size: 'sm' | 'md') => (
    <SegmentedControl size={size} aria-label="Kind">
      <Segment
        layoutId={`inbox-kind-${size}`}
        size={size}
        active={filters.kind === ''}
        onSelect={() => set({ kind: '' })}
      >
        All <span className="num text-ink-3">{total}</span>
      </Segment>
      {INBOX_ITEM_KINDS.map((kind) => (
        <Segment
          key={kind}
          layoutId={`inbox-kind-${size}`}
          size={size}
          active={filters.kind === kind}
          onSelect={() => set({ kind })}
        >
          {INBOX_KIND_LABEL[kind]}{' '}
          <span className="num text-ink-3">{counts[kind]}</span>
        </Segment>
      ))}
    </SegmentedControl>
  );

  return (
    <>
      {/* A phone gives the kinds a row of their own, tap-sized, as Workflows. */}
      <div className="mb-3 sm:hidden">
        <ScrollX>{kinds('md')}</ScrollX>
      </div>
      <Toolbar
        aria-label="Filter the Inbox"
        collapseBelow="sm"
        activeFilters={chips.activeFilters}
        onClearAll={chips.onClearAll}
        views={
          <div className="hidden sm:block">
            <ScrollX>{kinds('sm')}</ScrollX>
          </div>
        }
        filters={
          <Select
            aria-label="Project"
            value={filters.projectId}
            className="w-full sm:w-48"
            onChange={(e) => set({ projectId: e.target.value })}
          >
            <option value="">Every project</option>
            {filters.projectId &&
            !projects.some((p) => p.id === filters.projectId) ? (
              <option value={filters.projectId}>{filters.projectId}</option>
            ) : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        }
      />
    </>
  );
}
