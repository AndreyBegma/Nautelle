/** How the Slack module posts and paces its worker; tests override it. */
export interface SlackOptions {
  /**
   * `APP_URL`, else `WEB_URL` — the web app, prefixed to message links;
   * null: messages carry no link into the app.
   */
  appUrl: string | null;
  /** Start the delivery worker at bootstrap. Never under `APP_ENV=test`: suites drive it. */
  workerEnabled: boolean;
  /** How often the worker sends what is due. */
  intervalMs: number;
  /** One request to Slack. */
  timeoutMs: number;
  /** The HTTP client; tests inject a fake. */
  fetch: typeof fetch;
}

export const SLACK_OPTIONS = Symbol('SLACK_OPTIONS');

const trimmed = (value: string | undefined): string | null =>
  value?.trim().replace(/\/+$/, '') || null;

export const slackOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): SlackOptions => ({
  appUrl: trimmed(env.APP_URL) ?? trimmed(env.WEB_URL),
  workerEnabled: env.APP_ENV !== 'test',
  intervalMs: 5_000,
  timeoutMs: 10_000,
  fetch: (input, init) => fetch(input, init),
});
