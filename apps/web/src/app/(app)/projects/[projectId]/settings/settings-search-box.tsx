'use client';

import { ActionList } from '@andrewbehma/glass-ui/action-list';
import { SearchField } from '@andrewbehma/glass-ui/field';
import { useState } from 'react';
import { searchSettings } from '../../../../../lib/projects/settings-search';
import type { SettingsItemId } from '../../../../../lib/projects/settings-sections';

/** Enough to find a setting without pushing the page out of sight. */
const SHOWN = 8;

/**
 * C-395: one field over every setting of every section, by label and help
 * text. Choosing a result jumps to the block that edits it.
 */
export function SettingsSearchBox({
  onJump,
}: {
  onJump: (item: SettingsItemId) => void;
}) {
  const [query, setQuery] = useState('');
  const found = searchSettings(query);
  const searching = query.trim() !== '';

  return (
    <div className="flex flex-col gap-2">
      <SearchField
        aria-label="Search settings"
        placeholder="Search every setting"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {searching && found.length > 0 ? (
        <ActionList
          surface="content"
          heading={
            found.length > SHOWN
              ? `${SHOWN} of ${found.length} settings`
              : `${found.length} ${found.length === 1 ? 'setting' : 'settings'}`
          }
          items={found.slice(0, SHOWN).map((entry) => ({
            id: `${entry.item}:${entry.label}`,
            label: entry.label,
            description: entry.help
              ? `${entry.where} · ${entry.help}`
              : entry.where,
            chevron: true,
            onSelect: () => {
              setQuery('');
              onJump(entry.item);
            },
          }))}
        />
      ) : null}
      {searching && found.length === 0 ? (
        <p className="px-1 text-sm text-ink-3">
          No setting matches “{query.trim()}”.
        </p>
      ) : null}
    </div>
  );
}
