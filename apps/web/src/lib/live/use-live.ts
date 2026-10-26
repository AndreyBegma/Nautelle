'use client';

import type {
  LiveErrorCode,
  LiveEventMessage,
  LiveTopic,
} from '@nautelle/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getLiveClient, type LiveSnapshot } from './client';

/**
 * Receives the `event` frames published on `topic` (spec D15). The socket is
 * shared by the whole tab, opened with the first subscriber and closed after
 * the last; a reconnect resubscribes by itself. Pass `null` to stay unsubscribed.
 */
export function useLive(
  topic: LiveTopic | null,
  onMessage: (message: LiveEventMessage) => void,
  options?: {
    /** The server refused the topic (`forbidden`, `not_found`, …) or dropped it. */
    onError?: (code: LiveErrorCode) => void;
  },
): void {
  const latest = useRef(onMessage);
  const latestError = useRef(options?.onError);
  useEffect(() => {
    latest.current = onMessage;
    latestError.current = options?.onError;
  });
  const wantsErrors = options?.onError !== undefined;

  useEffect(() => {
    if (!topic) return;
    return getLiveClient().subscribe(
      topic,
      (message) => latest.current(message),
      wantsErrors ? (code) => latestError.current?.(code) : undefined,
    );
  }, [topic, wantsErrors]);
}

/**
 * `useLive` for several topics at once (a workspace page follows one per
 * project). Receives the `event` frames of every topic in `topics`.
 */
export function useLiveTopics(
  topics: readonly LiveTopic[],
  onMessage: (message: LiveEventMessage) => void,
): void {
  const latest = useRef(onMessage);
  useEffect(() => {
    latest.current = onMessage;
  });
  const key = topics.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the array.
  useEffect(() => {
    if (topics.length === 0) return;
    const stops = topics.map((topic) =>
      getLiveClient().subscribe(topic, (message) => latest.current(message)),
    );
    return () => {
      for (const stop of stops) stop();
    };
  }, [key]);
}

const SERVER_SNAPSHOT: LiveSnapshot = {
  status: 'reconnecting',
  closeCode: null,
};

/** Connection state of the tab's live socket, for the status dot. */
export function useLiveStatus(): LiveSnapshot {
  const client = typeof window === 'undefined' ? null : getLiveClient();
  return useSyncExternalStore(
    (listener) => client?.onChange(listener) ?? (() => {}),
    () => client?.getSnapshot() ?? SERVER_SNAPSHOT,
    () => SERVER_SNAPSHOT,
  );
}
