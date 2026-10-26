import { RUN_UPDATED_LIVE_EVENT } from '@nautelle/shared';
import { parseRunUpdate } from '../history/format';

/**
 * Whether a live frame on the project topic means the UI profile build has
 * settled: it is the `run.updated` of the build run the page is waiting on.
 */
export function shouldReloadOnRunUpdate(
  message: { event: string; data: unknown },
  building: boolean,
  buildRunId: string | null,
): boolean {
  if (!building || buildRunId === null) return false;
  if (message.event !== RUN_UPDATED_LIVE_EVENT) return false;
  return parseRunUpdate(message.data)?.id === buildRunId;
}
