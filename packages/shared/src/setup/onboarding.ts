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
  /** C-476: an AI provider is enabled (a monthly cap above 0) and has a key. */
  aiProvider: boolean;
  /**
   * C-476: the calling admin linked Telegram or turned on email for a kind,
   * or a project or workspace Slack webhook is set.
   */
  notifications: boolean;
}

/**
 * C-476: `GET /onboarding/me` (admin, operator) — an operator's Getting
 * started. Every fact is about the caller alone.
 */
export interface MyOnboardingFacts {
  /** The caller linked Telegram or turned on email for at least one kind. */
  notifications: boolean;
  /** The caller started a round of a card on any project. */
  cardRun: boolean;
  /** Projects the caller can see: every one for an admin, else those they are a member of. */
  projectCount: number;
}
