'use client';

import { Section } from '@andrewbehma/glass-ui/section';
import { StatusPill } from '@andrewbehma/glass-ui/status-pill';
import Link from 'next/link';
import {
  WORKING_KIND_LABEL,
  type WorkingRow,
} from '../../../../../lib/fleet/working-now';

/**
 * C-397 (ADR-0098): who works on the project right now — card workers,
 * orchestrator slots and sessions — each one a row that opens its card.
 * Nothing is created here; new work is a card on the Board.
 */
export function WorkingNow({ rows }: { rows: readonly WorkingRow[] }) {
  return (
    <Section
      title="Working now"
      description="Every hand on the project, and the card it works."
      pad="none"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-3">
          Nobody is working right now.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-start hover:bg-hover"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium">
                    <span className="font-mono text-ink-2">{row.label}</span>{' '}
                    {row.title}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {WORKING_KIND_LABEL[row.kind]}
                  </span>
                </span>
                <StatusPill size="md" status={row.status} label={row.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
