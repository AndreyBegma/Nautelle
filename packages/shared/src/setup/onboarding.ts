import type { PushCheckView } from '../projects/contracts';

/** C-396: how far the first card has got — nothing yet, a pull request, merged. */
export type OnboardingCardStage = 'none' | 'pr' | 'merged';

/**
 * C-396: `GET /admin/onboarding` (admin) — the facts behind Getting started
 * that `GET /admin/runners` and `GET /projects` do not carry. Every step of
 * the checklist ticks from one of them, so it reflects real state.
 */
export interface OnboardingFacts {
  /** A connected project has a runtime profile for its agents (its default or its orchestrator's). */
  profile: boolean;
  /** A paired runner reports the nautelle plugin installed in one of its Claude profiles. */
  plugin: boolean;
  /**
   * A push check of a connected project's checkout: a passing one when there
   * is one, else the latest; null when none ran.
   */
  pushCheck: (PushCheckView & { projectId: string }) | null;
  /** The furthest any card has got. */
  firstCard: OnboardingCardStage;
  /** The GitHub App is registered and installed on at least one account. */
  githubApp: boolean;
  /** Someone other than the first administrator has an account. */
  teammates: boolean;
  /** C-476: an AI provider has a key on Admin › AI providers. */
  aiProvider: boolean;
}

/**
 * C-476: `GET /onboarding/me` (admin, operator) — the facts about the caller
 * alone behind Getting started: an operator's whole checklist, and an admin's
 * notifications step.
 */
export interface MyOnboardingFacts {
  /** The first project the caller can see, as `GET /projects` orders them; null when none. */
  project: { id: string; displayName: string } | null;
  /** The caller linked Telegram or turned on email for at least one kind. */
  notifications: boolean;
  /** The caller started a round of a card. */
  ranCard: boolean;
}
