import type { SetupStatus } from '@nautelle/shared';

export const SETUP_PATH = '/setup';
export const LOGIN_PATH = '/login';

const API_URL = process.env.API_URL ?? 'http://localhost:8180';

/**
 * C-367: whether the instance still has no user, from `GET /setup/status`.
 * Null when the API cannot say — down or answering an error — so neither page
 * redirects and the two can never bounce a visitor between them.
 */
export async function needsSetup(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_URL}/setup/status`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return ((await response.json()) as SetupStatus).needsSetup;
  } catch {
    return null;
  }
}

/** Where `/login` sends a visitor: to `/setup` while no account exists. */
export function loginRedirect(needsSetup: boolean | null): string | null {
  return needsSetup === true ? SETUP_PATH : null;
}

/** Where `/setup` sends a visitor: to `/login` once an account exists. */
export function setupRedirect(needsSetup: boolean | null): string | null {
  return needsSetup === false ? LOGIN_PATH : null;
}

/** The `?token=` of the setup link; a repeated or empty one counts as none. */
export function setupToken(
  token: string | string[] | undefined,
): string | null {
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

const SETUP_LINK_PATTERN = "grep -o 'http[^ ]*/setup?token=[^ ]*' | tail -n 1";

/**
 * C-396: where the API logged the setup link, per way of installing. The
 * "no users yet" page shows them all; the Helm NOTES print the same command
 * with the release's own names.
 */
export const SETUP_LINK_COMMANDS: readonly {
  label: string;
  command: string;
}[] = [
  {
    label: 'Docker Compose',
    command: `docker compose logs api | ${SETUP_LINK_PATTERN}`,
  },
  {
    label: 'All-in-one image',
    command: `docker logs <container> 2>&1 | ${SETUP_LINK_PATTERN}`,
  },
  {
    label: 'Kubernetes (Helm)',
    command: `kubectl -n <namespace> logs deploy/<release>-api | ${SETUP_LINK_PATTERN}`,
  },
];
