'use client';

import { Badge } from '@andrewbehma/glass-ui/badge';
import { Banner } from '@andrewbehma/glass-ui/banner';
import { CodeBlock } from '@andrewbehma/glass-ui/code-block';
import { Disclosure } from '@andrewbehma/glass-ui/disclosure';
import type { ProductRelease } from '@nautelle/shared';
import { ArrowRight, ChevronDown, Database, Info } from 'lucide-react';
import { useState } from 'react';
import {
  BACKUP_GUIDE_URL,
  COMPOSE_UPGRADE_COMMAND,
  INSTALL_SCRIPT_COMMAND,
  pinnedVersionLine,
  UPGRADE_GUIDE_URL,
} from '../../lib/updates/product-update';

const LINK = 'text-accent-ink underline underline-offset-2';

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK}>
      {children}
    </a>
  );
}

/** The running version in danger, the new one in ok, an arrow between them. */
function VersionChange({
  current,
  latest,
}: {
  current: string;
  latest: string;
}) {
  return (
    <span
      role="img"
      aria-label={`Running ${current}, latest ${latest}`}
      className="inline-flex items-center gap-1.5"
    >
      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-3">
        Running
        <Badge tone="danger" size="md" label={current} className="font-mono" />
      </span>
      <ArrowRight className="size-3.5 text-ink-3" aria-hidden="true" />
      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-3">
        Latest
        <Badge tone="ok" size="md" label={latest} className="font-mono" />
      </span>
    </span>
  );
}

function Way({
  n,
  title,
  children,
  code,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  code: string;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="inline-flex size-[18px] items-center justify-center rounded-full bg-hover text-[11px] text-ink-2"
        >
          {n}
        </span>
        {title}
      </div>
      <p className="text-xs leading-[18px] text-ink-2">{children}</p>
      <CodeBlock code={code} />
    </li>
  );
}

/** Backup warning, the three ways to upgrade, and where they run. */
function HowToUpdate({ release }: { release: ProductRelease }) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      open={open}
      onOpenChange={setOpen}
      trigger={
        <span className="inline-flex items-center gap-1">
          How to update
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      }
    >
      <div className="flex flex-col gap-3.5 pt-3">
        <div className="flex items-start gap-2 rounded-control border border-warn/30 bg-warn/10 px-2.5 py-2">
          <Database className="mt-0.5 size-4 text-warn" aria-hidden="true" />
          <p>
            <b>Take a backup first.</b>{' '}
            <span className="text-ink-2">
              Downgrading is not supported. A backup is the way back.
            </span>{' '}
            <ExternalLink href={BACKUP_GUIDE_URL}>
              Back up an install
            </ExternalLink>
          </p>
        </div>
        <ol className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Way n={1} title="Docker Compose" code={COMPOSE_UPGRADE_COMMAND}>
            Run in the <code className="font-mono text-ink">nautelle</code>{' '}
            directory on the server. The API applies migrations when it starts.
          </Way>
          <Way n={2} title="Re-run install.sh" code={INSTALL_SCRIPT_COMMAND}>
            Fetches the current compose file and keeps{' '}
            <code className="font-mono text-ink">.env</code> and its passwords.
          </Way>
          <Way
            n={3}
            title="Pinned to a version"
            code={pinnedVersionLine(release)}
          >
            If <code className="font-mono text-ink">nautelle/.env</code> pins{' '}
            <code className="font-mono text-ink">NAUTELLE_VERSION</code>, change
            it to this line, then run{' '}
            <code className="font-mono text-ink">docker compose up -d</code>.
          </Way>
        </ol>
        <p className="flex items-start gap-2 text-xs leading-[18px] text-ink-2">
          <Info className="mt-px size-3.5 text-ink-3" aria-hidden="true" />
          <span>
            Run these on the server. Nautelle cannot restart its own stack from
            the web app. Runners are upgraded separately, on their own machines.
          </span>
        </p>
      </div>
    </Disclosure>
  );
}

/**
 * C-374, C-526: "Nautelle X.Y.Z is available" with the running and the new
 * version side by side, and how to upgrade. Admins only; dismissing it hides
 * it until the next release. It never runs an upgrade: the server cannot
 * restart its own compose stack, and a runner may live on another machine.
 */
export function ProductUpdateNotice({
  release,
  current,
  onDismiss,
}: {
  release: ProductRelease;
  current: string;
  onDismiss: () => void;
}) {
  return (
    <Banner
      tone="info"
      title={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <span>Nautelle update available</span>
          <VersionChange current={current} latest={release.version} />
          <span className="inline-flex items-center gap-3 text-xs font-normal">
            <ExternalLink href={release.url}>Release notes</ExternalLink>
            <ExternalLink href={UPGRADE_GUIDE_URL}>Upgrade guide</ExternalLink>
          </span>
        </span>
      }
      onDismiss={onDismiss}
    >
      <HowToUpdate release={release} />
    </Banner>
  );
}
