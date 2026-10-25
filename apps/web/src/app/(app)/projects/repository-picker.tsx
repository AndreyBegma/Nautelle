'use client';

import { Button } from '@andrewbehma/glass-ui/button';
import { Input } from '@andrewbehma/glass-ui/field';
import { Radio, RadioGroup } from '@andrewbehma/glass-ui/radio-group';
import type { DiscoverProjectsRequest } from '@nautelle/shared';
import type { ProjectDiscoverResult } from '@nautelle/shared/protocol';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import {
  describeProjectError,
  filterRepositories,
} from '../../../lib/projects/format';

type Listing =
  | { status: 'loading' }
  | { status: 'ready'; result: ProjectDiscoverResult }
  | { status: 'failed'; message: string };

/**
 * C-396: the git repositories the runner finds under its allowed roots, so
 * the admin picks one instead of typing a path. "Use repository" hands its
 * main checkout's path to the dialog, which inspects it. The typed path stays
 * below as the fallback: a repository outside the roots, or a runner too old
 * to list them.
 */
export function RepositoryPicker({
  runnerId,
  disabled,
  onUse,
}: {
  runnerId: string;
  disabled: boolean;
  onUse: (path: string) => void;
}) {
  const [listing, setListing] = useState<Listing>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');

  useEffect(() => {
    let current = true;
    setListing({ status: 'loading' });
    setChosen('');
    const body: DiscoverProjectsRequest = { runnerId };
    api<ProjectDiscoverResult>('/admin/projects/discover', {
      method: 'POST',
      body,
    })
      .then((result) => {
        if (current) setListing({ status: 'ready', result });
      })
      .catch((err) => {
        if (current) {
          setListing({ status: 'failed', message: describeProjectError(err) });
        }
      });
    return () => {
      current = false;
    };
  }, [runnerId]);

  if (listing.status === 'loading') {
    return (
      <p role="status" className="text-sm text-ink-2">
        Looking for git repositories on the runner…
      </p>
    );
  }
  if (listing.status === 'failed') {
    return (
      <p role="status" className="text-sm text-ink-2">
        The runner could not list its repositories, so type the path below. (
        {listing.message})
      </p>
    );
  }

  const { roots, repositories, truncated } = listing.result;
  if (repositories.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        {roots.length === 0
          ? 'The runner allows no folders, so it has nothing to list. Type the path below.'
          : `No git repositories under ${roots.join(', ')}. Type the path below.`}
      </p>
    );
  }

  const shown = filterRepositories(repositories, query);
  return (
    <div className="flex flex-col gap-3" data-testid="repository-picker">
      <Input
        aria-label="Search repositories"
        type="search"
        value={query}
        placeholder="Search repositories"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-60 overflow-y-auto pr-1">
        {shown.length === 0 ? (
          <p className="text-sm text-ink-2">No repository matches.</p>
        ) : (
          <RadioGroup label="Repositories on the runner">
            {shown.map((repository) => (
              <Radio
                key={repository.path}
                name="connect-repository"
                label={repository.repo ?? repository.name}
                hint={
                  repository.repo
                    ? repository.path
                    : `${repository.path} · no GitHub origin`
                }
                checked={chosen === repository.path}
                disabled={disabled}
                onChange={() => setChosen(repository.path)}
              />
            ))}
          </RadioGroup>
        )}
      </div>
      {truncated ? (
        <p className="text-xs text-ink-3">
          The runner stopped looking at its limit, so some repositories may be
          missing. Search, or type the path below.
        </p>
      ) : null}
      <div>
        <Button
          variant="solid"
          size="sm"
          disabled={disabled || chosen === ''}
          onClick={() => onUse(chosen)}
        >
          Use repository
        </Button>
      </div>
    </div>
  );
}
