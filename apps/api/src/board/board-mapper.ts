import {
  type AttachmentView,
  BOARD_MAX_RUNNING_DEFAULT,
  type BoardCardDetail,
  type BoardCardView,
  type BoardSettingsView,
  type BoardUserRef,
  CAPTURE_MODEL_DEFAULT,
  CARD_BACKGROUND_STALL_MINUTES_DEFAULT,
  CARD_DECIDING_SIGNALS,
  CARD_HOOKS_GRACE_MS,
  CARD_MERGE_POLICY_DEFAULT,
  type CardAnalysisView,
  type CardDecidingSignal,
  type CardDemoBrief,
  type CardDependencyRef,
  type CardEscalationView,
  type CardEvidenceView,
  type CardFleetView,
  type CardHooksCause,
  type CardLabelView,
  type CardPrTarget,
  type CardPullRequestRef,
  type CardQueueView,
  type CardRecommendationView,
  type CardReviewState,
  type CardReviewStepView,
  type CardReviewView,
  type CardRoundBrief,
  type CardRoundCiState,
  type CardRoundView,
  type CardStackRef,
  type CardTakenView,
  type CardTrackingView,
  cardAutoMergeDefault,
  cardCiChecksOf,
  cardLabel,
  cardReadiness,
  cardRecommendationOf,
  commitChecksUrl,
  FLEET_STAGES,
  type FleetStage,
  isActiveRoundPhase,
  isCaptureModel,
  isCardAutoRunCode,
  isCardNeedsPersonReason,
  modelByType,
  type PendingQuestion,
  pendingQuestionSchema,
  REVIEW_FIX_ROUNDS_MAX,
  type RestartEstimate,
  restartEstimateSchema,
  type StewardCardChip,
  type TaskAssigneeView,
  type TaskChecklistItemView,
  type TaskDesignSummary,
  type TokenSavedView,
} from '@nautelle/shared';
import {
  type CardRunWiring,
  type CardRunWiringReason,
  cardRunWiringReasonSchema,
  cardRunWiringSchema,
  type LocalErrorCode,
  localErrorCodeSchema,
  type PaneDialog,
  type ProfileAgentdock,
  paneDialogSchema,
  quotaLimitSchema,
} from '@nautelle/shared/protocol';
import {
  type BoardCard,
  type BoardCardChecklistItem,
  type BoardCardProposal,
  type BoardCardPullRequest,
  type BoardCardReviewRun,
  type BoardCardRound,
  type BoardSettings,
  type CardCiState,
  Prisma,
  type ProjectReviewStep,
} from '@prisma/client';
import type { TokenSaverCardFacts } from '../token-saver/token-saver-facts';
import type { CardModelByTypeArm } from './launch-choice';

/** #243: what a card's face shows of its design — the Design chip. */
export const cardDesignSelect = {
  select: {
    needed: true,
    suggested: true,
    suggestionWhy: true,
    variantCount: true,
    status: true,
    approvedRevisionId: true,
    busySince: true,
  },
} as const satisfies Prisma.BoardCard$designArgs;

type CardDesignRow = Prisma.TaskDesignGetPayload<typeof cardDesignSelect>;

/**
 * A card with its rounds, newest first, as the board reads it — and its
 * design's summary where the read asked for it.
 */
export type CardWithRounds = BoardCard & {
  rounds: BoardCardRound[];
  design?: CardDesignRow | null;
};

/**
 * C-364: the card columns `GET /board` leaves out — the body, the capture
 * evidence, the session prefix and the escalation note. No card face reads
 * them; the detail (`GET /board/cards/:number`) still does.
 */
export const cardFaceOmit = {
  body: true,
  evidence: true,
  sessionPrefix: true,
  escalationNote: true,
} as const satisfies Prisma.BoardCardOmit;

/**
 * C-364: the round columns a card face reads — `toCardView` and the board's
 * facts. The prompt snapshot (`cardBody`, `cardAttachments`), the feedback,
 * the summary and the restart estimate stay on the detail.
 */
export const cardFaceRoundSelect = {
  id: true,
  round: true,
  runId: true,
  trigger: true,
  phase: true,
  finishedBy: true,
  startedAt: true,
  waitingAt: true,
  backgroundAt: true,
  backgroundCommand: true,
  wiring: true,
  wiringReason: true,
  autoRunAfter: true,
  pendingQuestion: true,
  finishRefusedCode: true,
  blockingDialog: true,
  quotaLimit: true,
  quotaResetsAt: true,
  restartMode: true,
  pausedFor: true,
} as const satisfies Prisma.BoardCardRoundSelect;

export type CardFaceRound = Prisma.BoardCardRoundGetPayload<{
  select: typeof cardFaceRoundSelect;
}>;

/**
 * C-364: the `findMany` arguments that read a card face — the Board's and
 * the Inbox's (C-390) read.
 */
export const cardFaceArgs = {
  omit: cardFaceOmit,
  include: {
    rounds: {
      orderBy: { round: 'desc' as const },
      select: cardFaceRoundSelect,
    },
    design: cardDesignSelect,
  },
} satisfies Prisma.BoardCardFindManyArgs;

/** C-364: a card as its face reads it; every `CardWithRounds` is one. */
export type CardFace = Omit<BoardCard, keyof typeof cardFaceOmit> & {
  rounds: CardFaceRound[];
  design?: CardDesignRow | null;
};

/** #243: the Design chip; `null` when the card has no design or it is off. */
const designOf = (
  design: CardDesignRow | null | undefined,
): TaskDesignSummary | null =>
  design?.needed
    ? { ...design, busySince: design.busySince?.toISOString() ?? null }
    : null;

export type CardWithPeople = CardWithRounds & {
  createdBy: BoardUserRef | null;
  movedBy: BoardUserRef | null;
  completedBy: BoardUserRef | null;
  rounds: (BoardCardRound & { author: BoardUserRef | null })[];
  /** #359 D8: the card's PRs, where the read included them; absent is none. */
  pullRequests?: BoardCardPullRequest[];
  /** C-503: an analysis card's proposals, where the read included them. */
  proposals?: CardProposalRow[];
  /** C-503: the analysis card this one was created from, where read. */
  originCard?: { number: number; title: string } | null;
  /** C-509: a task's checklist in position order, where the read included it. */
  checklist?: CardChecklistRow[];
};

/** C-509: a checklist item with the person who ticked it. */
export type CardChecklistRow = BoardCardChecklistItem & {
  doneBy: { id: string; name: string | null; email: string } | null;
};

/** C-509: what a task's face shows besides its own columns. */
export interface CardTaskFact {
  assignee: TaskAssigneeView | null;
  checklist: { done: number; total: number };
  raisedFor: CardDependencyRef | null;
}

/** C-503: a proposal with the card Create selected made of it. */
export type CardProposalRow = BoardCardProposal & {
  createdCard: { number: number; title: string } | null;
};

/**
 * C-503 (ADR-0126): an analysis card's report — the latest round that has
 * one — and its proposals, the newest round's first, each round's by
 * position. `null` for every other kind.
 */
export const analysisOf = (
  card: Pick<CardWithPeople, 'kind' | 'rounds' | 'proposals'>,
): CardAnalysisView | null => {
  if (card.kind !== 'analysis') return null;
  const rounds = [...card.rounds].sort((a, b) => b.round - a.round);
  const reported = rounds.find((r) => r.report !== null) ?? null;
  const order = new Map(rounds.map((r) => [r.id, r.round]));
  const proposals = [...(card.proposals ?? [])].sort(
    (a, b) =>
      (order.get(b.roundId) ?? 0) - (order.get(a.roundId) ?? 0) ||
      a.position - b.position,
  );
  return {
    report: reported?.report ?? null,
    roundId: reported?.id ?? null,
    proposals: proposals.map((p) => ({
      position: p.position,
      title: p.title,
      body: p.body,
      kind: p.kind,
      labels: p.labels,
      dependsOn: p.dependsOn,
      status: p.status,
      createdCard: p.createdCard,
    })),
  };
};

/** #359 D8: the card's PRs, oldest first. */
const pullRequestsOf = (
  rows: readonly BoardCardPullRequest[] | undefined,
): CardPullRequestRef[] =>
  [...(rows ?? [])]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((pr) => ({
      number: pr.number,
      url: pr.url,
      branch: pr.branch,
      state: pr.state,
      round: pr.round,
      createdAt: pr.createdAt.toISOString(),
    }));

/**
 * #636: where a card's PR goes — the dependency's branch it is stacked on
 * (`stackedOn` that card, when known, and whether its own PR has merged —
 * #709), else the project base; `null` before the card has a branch.
 */
export const prTargetOf = (
  card: Pick<BoardCard, 'branch' | 'prBase'>,
  stackedOn: Pick<BoardCard, 'number' | 'mergedAt'> | null,
  projectBase: string,
): CardPrTarget | null => {
  if (card.branch === null) return null;
  if (card.prBase === null) return { branch: projectBase, stackedOn: null };
  return {
    branch: card.prBase,
    stackedOn:
      stackedOn === null
        ? null
        : {
            number: stackedOn.number,
            label: cardLabel(stackedOn.number),
            merged: stackedOn.mergedAt !== null,
          },
  };
};

/** #884: an enabled review step of a project, as the review strip names it. */
export type CardReviewStepFact = Pick<ProjectReviewStep, 'id' | 'name'>;

/** #884: one run of a review step on a card's pull request. */
export type CardReviewRunFact = Pick<
  BoardCardReviewRun,
  | 'stepId'
  | 'prNumber'
  | 'headSha'
  | 'pass'
  | 'state'
  | 'blockingCount'
  | 'nitCount'
  | 'startedAt'
>;

/** What the mapper needs besides the rows. */
export interface CardFacts {
  /** Cost of each round's run, a decimal string; absent when nothing is priced. */
  costs: ReadonlyMap<string, string>;
  /** Card sessions a hook event has reached (the board sink claimed them). */
  hooked: ReadonlySet<string>;
  /** #282 D1: tracked sessions (`sessions.id`) that have not ended. */
  alive: ReadonlySet<string>;
  /** #348 D1: each round's run profile key (`runs.profileKey`); absent is none. */
  runProfileKeys: ReadonlyMap<string, string>;
  /** #348 D1: each project's runner reports, by profile key (`profileAgentdockOf`). */
  profileAgentdock: ReadonlyMap<string, Record<string, ProfileAgentdock>>;
  /** #309: attachments of each card, its rounds' included; absent is none. */
  attachmentCounts: ReadonlyMap<string, number>;
  /** #337 D8: the cards each one runs after, in number order; absent is none. */
  dependencies: ReadonlyMap<string, CardDependencyRef[]>;
  /** #445: each round run's savings estimate and artifact-guard flag. */
  tokenSaver: TokenSaverCardFacts;
  /**
   * #447 D15: the live Steward incident of each round, by round id
   * (`StewardChips.forRounds`); absent is none.
   */
  steward?: ReadonlyMap<string, StewardCardChip>;
  /**
   * #449 D9: what each `fresh` round's start saved, a decimal string, by
   * round id (`restartSavingsFor`); absent is none.
   */
  restartSavings?: ReadonlyMap<string, string>;
  /** #480: each card's stack, by card id; absent is none. */
  stacks?: ReadonlyMap<string, CardStackRef>;
  /** #636: where each card's PR goes, by card id; absent is not known. */
  prTargets?: ReadonlyMap<string, CardPrTarget>;
  /**
   * #884: each project's enabled review steps in position order, by project
   * id; absent while review is off or no step is enabled.
   */
  reviewSteps?: ReadonlyMap<string, readonly CardReviewStepFact[]>;
  /** #884: each card's review runs, by card id; absent is none. */
  reviewRuns?: ReadonlyMap<string, readonly CardReviewRunFact[]>;
  /**
   * #913: why each project's runner policy refuses `session.message`
   * (`commandPolicyRefusalOf`), by project id; absent is not refused.
   */
  messagesRefused?: ReadonlyMap<string, string>;
  /** C-371: each card's newest demo recording, by card id; absent is none. */
  demos?: ReadonlyMap<string, CardDemoBrief>;
  /** C-398: each queued card's place in the run queue, by card id; absent is none. */
  queue?: ReadonlyMap<string, CardQueueView>;
  /** C-497: each card's labels in label position order, by card id; absent is none. */
  labels?: ReadonlyMap<string, readonly CardLabelView[]>;
  /** C-509: each task's assignee, checklist count and origin, by card id; absent for other kinds. */
  tasks?: ReadonlyMap<string, CardTaskFact>;
  now: Date;
}

/**
 * #449 D9: the card chip's facts — how the latest round's session started
 * and, after a `fresh` start, what it saved.
 */
export const restartOf = (
  card: CardFace,
  facts: Pick<CardFacts, 'restartSavings'>,
): Pick<BoardCardView, 'restartMode' | 'warmupSavedUsd'> => {
  const latest = card.rounds[0];
  return {
    restartMode: latest?.restartMode ?? null,
    warmupSavedUsd:
      latest?.restartMode === 'fresh'
        ? (facts.restartSavings?.get(latest.id) ?? null)
        : null,
  };
};

/** #449 D3: the round's stored estimates; `null` when none or unreadable. */
const restartEstimateOf = (
  json: Prisma.JsonValue | null,
): RestartEstimate | null => {
  const parsed = restartEstimateSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

/** #447 D15: the chip of the card's latest round's live incident. */
export const stewardChipOf = (
  card: CardFace,
  facts: Pick<CardFacts, 'steward'>,
): StewardCardChip | null => {
  const latest = card.rounds[0];
  return latest ? (facts.steward?.get(latest.id) ?? null) : null;
};

/** #282 D1: a `terminal` card's session; `null` once the session row is gone. */
const trackingOf = (
  card: CardFace,
  facts: CardFacts,
): CardTrackingView | null =>
  card.source === 'terminal' && card.trackedSessionId !== null
    ? {
        sessionId: card.trackedSessionId,
        alive: facts.alive.has(card.trackedSessionId),
      }
    : null;

/**
 * #845 D2, D10: a card a manual session took (`card.take`) — any bound card
 * that is not the session's own `terminal` one. "Session ended" once
 * `alive` is false.
 */
export const takenOf = (
  card: Pick<BoardCard, 'source' | 'trackedSessionId' | 'takenBranch'>,
  facts: Pick<CardFacts, 'alive'>,
): CardTakenView | null =>
  card.source !== 'terminal' && card.trackedSessionId !== null
    ? {
        sessionId: card.trackedSessionId,
        alive: facts.alive.has(card.trackedSessionId),
        branch: card.takenBranch,
      }
    : null;

const isFleetStage = (value: string): value is FleetStage =>
  (FLEET_STAGES as readonly string[]).includes(value);

/** #282 D4: a `fleet` card's slot, as the fleet projector wrote it. */
const fleetOf = (card: CardFace): CardFleetView | null =>
  card.source === 'fleet' && card.fleetIssue !== null
    ? {
        issue: card.fleetIssue,
        slot: card.fleetSlot,
        stage:
          card.fleetStage !== null && isFleetStage(card.fleetStage)
            ? card.fleetStage
            : null,
        slotGone: card.fleetSlotGone,
        detached: card.fleetDetached,
      }
    : null;

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

/**
 * D6: an active round older than the grace whose session no hook event ever
 * reached — the plugin's hooks are not installed where the worker runs.
 */
const hooksMissing = (
  card: Pick<BoardCard, 'sessionId'>,
  round: CardFaceRound,
  facts: CardFacts,
): boolean =>
  isActiveRoundPhase(round.phase) &&
  facts.now.getTime() - round.startedAt.getTime() >= CARD_HOOKS_GRACE_MS &&
  !(card.sessionId !== null && facts.hooked.has(card.sessionId));

/**
 * #348 D1: why hooks are missing, and for which profile. `null` cause when they
 * are not missing; `unknown` when the run has no profile key, the runner
 * reports no such profile, or the profile has no `agentdock` field.
 */
export const hooksCauseOf = (
  card: Pick<BoardCard, 'sessionId' | 'projectId'>,
  round: CardFaceRound,
  facts: CardFacts,
): {
  hooksCause: CardHooksCause | null;
  hooksProfile: string | null;
} => {
  if (!hooksMissing(card, round, facts)) {
    return { hooksCause: null, hooksProfile: null };
  }
  const hooksProfile = facts.runProfileKeys.get(round.runId) ?? null;
  const report =
    hooksProfile === null
      ? undefined
      : facts.profileAgentdock.get(card.projectId)?.[hooksProfile];
  const hooksCause: CardHooksCause =
    report === undefined
      ? 'unknown'
      : report.plugin === null
        ? 'no_plugin'
        : 'session_predates';
  return { hooksCause, hooksProfile };
};

/** #367 D3: a round's launch facts as stored (`null` until it started). */
export const wiringOf = (
  round: Pick<BoardCardRound, 'wiring' | 'wiringReason'>,
): {
  wiring: CardRunWiring | null;
  wiringReason: CardRunWiringReason | null;
} => {
  const wiring = cardRunWiringSchema.safeParse(round.wiring);
  if (!wiring.success) return { wiring: null, wiringReason: null };
  const reason = cardRunWiringReasonSchema.safeParse(round.wiringReason);
  return {
    wiring: wiring.data,
    wiringReason: wiring.data === 'none' && reason.success ? reason.data : null,
  };
};

/** #482: a refused `finish_card` counts only while the round is active. */
export const finishRefusedOf = (
  round: Pick<BoardCardRound, 'phase' | 'finishRefusedCode'>,
): LocalErrorCode | null => {
  if (!isActiveRoundPhase(round.phase)) return null;
  const code = localErrorCodeSchema.safeParse(round.finishRefusedCode);
  return code.success ? code.data : null;
};

/** #624: the dialog that blocks a round counts only while it waits. */
export const blockingDialogOf = (
  round: Pick<BoardCardRound, 'phase' | 'blockingDialog'>,
): PaneDialog | null => {
  if (round.phase !== 'waiting') return null;
  const dialog = paneDialogSchema.safeParse(round.blockingDialog);
  return dialog.success ? dialog.data : null;
};

/** #741: the usage limit an active round waits on, as the runner reported it. */
export const quotaWaitOf = (
  round: Pick<BoardCardRound, 'phase' | 'quotaLimit' | 'quotaResetsAt'>,
): CardRoundBrief['quotaWait'] => {
  if (!isActiveRoundPhase(round.phase)) return null;
  const limit = quotaLimitSchema.safeParse(round.quotaLimit);
  return limit.success
    ? { limit: limit.data, resetsAt: iso(round.quotaResetsAt) }
    : null;
};

const brief = (
  card: CardFace,
  round: CardFaceRound | undefined,
  facts: CardFacts,
): CardRoundBrief | null =>
  round
    ? {
        round: round.round,
        phase: round.phase,
        finishedBy: round.finishedBy,
        waitingAt: iso(round.waitingAt),
        backgroundAt: iso(round.backgroundAt),
        backgroundCommand: round.backgroundCommand,
        hooksMissing: hooksMissing(card, round, facts),
        ...hooksCauseOf(card, round, facts),
        ...wiringOf(round),
        autoRunAfter: round.autoRunAfter,
        pendingQuestion: pendingQuestionOf(round),
        finishRefused: finishRefusedOf(round),
        blockingDialog: blockingDialogOf(round),
        quotaWait: quotaWaitOf(round),
        pausedFor: round.pausedFor,
      }
    : null;

/** #489 M4: an active round's question screen, as the runner reported it. */
export const pendingQuestionOf = (
  round: Pick<BoardCardRound, 'phase' | 'pendingQuestion'>,
): PendingQuestion | null => {
  if (!isActiveRoundPhase(round.phase) || round.pendingQuestion === null) {
    return null;
  }
  const parsed = pendingQuestionSchema.safeParse(round.pendingQuestion);
  return parsed.success ? parsed.data : null;
};

/** #884: the reasons a card waits on a person because of its review. */
const REVIEW_NEEDS_PERSON: ReadonlySet<string> = new Set([
  'review_still_blocking',
  'review_failed',
]);

/**
 * #884 (ADR-0084): the review strip. The steps show the newest pass on the
 * card's current pull request — the highest `pass`, and of it the head
 * reviewed last — so a `review_fix` round still shows the findings it fixes.
 * `passed` only while that pass reviewed the head CI last checked.
 */
export const reviewOf = (
  card: CardFace,
  steps: readonly CardReviewStepFact[] | undefined,
  runs: readonly CardReviewRunFact[],
): CardReviewView | null => {
  if (steps === undefined || steps.length === 0) return null;
  const onPr = runs.filter((r) => r.prNumber === card.prNumber);
  const newest = onPr.reduce<CardReviewRunFact | null>(
    (best, r) =>
      best === null ||
      r.pass > best.pass ||
      (r.pass === best.pass && r.startedAt > best.startedAt)
        ? r
        : best,
    null,
  );
  const runOf = new Map(
    onPr.flatMap((r) =>
      newest !== null &&
      r.pass === newest.pass &&
      r.headSha === newest.headSha &&
      r.stepId !== null
        ? [[r.stepId, r] as const]
        : [],
    ),
  );
  const views = steps.map((step): CardReviewStepView => {
    const run = runOf.get(step.id);
    return {
      id: step.id,
      name: step.name,
      state: run?.state ?? 'pending',
      blockingCount: run?.blockingCount ?? 0,
      nitCount: run?.nitCount ?? 0,
    };
  });
  const running = views.findIndex((s) => s.state === 'running');
  const lastRan = views.reduce(
    (last, s, index) => (s.state === 'pending' ? last : index),
    0,
  );
  const latest = card.rounds[0];
  const state: CardReviewState =
    card.needsPerson &&
    card.needsPersonReason !== null &&
    REVIEW_NEEDS_PERSON.has(card.needsPersonReason)
      ? 'needs_person'
      : latest?.trigger === 'review_fix' && isActiveRoundPhase(latest.phase)
        ? 'fixing'
        : running >= 0
          ? 'running'
          : newest?.headSha === card.ciHeadSha &&
              views.every((s) => s.state === 'passed')
            ? 'passed'
            : 'idle';
  return {
    state,
    ...(running >= 0 ? { currentStep: views[running].name } : {}),
    stepIndex: running >= 0 ? running : lastRan,
    stepCount: views.length,
    fixRound: card.reviewFixAttempts,
    fixLimit: REVIEW_FIX_ROUNDS_MAX,
    steps: views,
  };
};

/** The sum of the rounds' priced costs; `null` when none is priced. */
const cardCost = (
  rounds: readonly Pick<BoardCardRound, 'runId'>[],
  costs: ReadonlyMap<string, string>,
): string | null => {
  let total: Prisma.Decimal | null = null;
  for (const round of rounds) {
    const cost = costs.get(round.runId);
    if (cost === undefined) continue;
    total = (total ?? new Prisma.Decimal(0)).plus(cost);
  }
  return total?.toFixed(6) ?? null;
};

/**
 * #445 D13: the rounds' estimates summed, as `cardCost`; `null` when none.
 * #748 D2: plus the tracked session's, which a terminal card has instead of
 * rounds.
 */
const cardTokenSaved = (
  card: CardFace,
  facts: TokenSaverCardFacts,
): TokenSavedView | null => {
  const session =
    card.trackedSessionId === null
      ? undefined
      : facts.tokenSavedBySession.get(card.trackedSessionId);
  const of = [
    ...card.rounds.flatMap((round) => facts.tokenSaved.get(round.runId) ?? []),
    ...(session === undefined ? [] : [session]),
  ];
  if (of.length === 0) return null;
  return {
    estimateTokens: of.reduce((sum, s) => sum + s.estimateTokens, 0),
    estimateUsd: of.reduce((sum, s) => sum + s.estimateUsd, 0),
  };
};

export const toCardView = (
  card: CardFace,
  facts: CardFacts,
): BoardCardView => ({
  id: card.id,
  number: card.number,
  label: cardLabel(card.number),
  title: card.title,
  kind: card.kind,
  kindSource: card.kindSource,
  labels: [...(facts.labels?.get(card.id) ?? [])],
  designTemplate: card.designTemplate,
  designTemplateSource: card.designTemplateSource,
  column: card.column,
  position: card.position,
  source: card.source,
  issueNumber: card.issueNumber,
  issueUrl: card.issueUrl,
  prNumber: card.prNumber,
  prUrl: card.prUrl,
  prState: card.prState,
  collectState: card.collectState,
  collectError: card.collectState === 'failed' ? card.collectError : null,
  ciState: card.ciState,
  ciChecks: card.ciState === 'red' ? cardCiChecksOf(card.ciChecks) : [],
  ciFixAttempts: card.ciFixAttempts,
  needsPerson: card.needsPerson,
  needsPersonReason:
    card.needsPerson &&
    card.needsPersonReason !== null &&
    isCardNeedsPersonReason(card.needsPersonReason)
      ? card.needsPersonReason
      : null,
  review: reviewOf(
    card,
    facts.reviewSteps?.get(card.projectId),
    facts.reviewRuns?.get(card.id) ?? [],
  ),
  protectedPaths: card.protectedPaths,
  mergedAt: iso(card.mergedAt),
  demo: facts.demos?.get(card.id) ?? null,
  prTarget: facts.prTargets?.get(card.id) ?? null,
  round: brief(card, card.rounds[0], facts),
  design: designOf(card.design),
  continueAfterDesign: card.continueAfterDesign,
  costUsd: cardCost(card.rounds, facts.costs),
  tokenSaved: cardTokenSaved(card, facts.tokenSaver),
  // #445 D8: the latest round's finish.
  artifactIncomplete:
    card.rounds[0] !== undefined &&
    facts.tokenSaver.artifactIncomplete.has(card.rounds[0].runId),
  captureWhy: card.captureWhy,
  captureConfidence: card.captureConfidence,
  sourceSessionId: card.sourceSessionId,
  autoRunFailure:
    card.autoRunError !== null && card.autoRunFailedAt !== null
      ? {
          code: isCardAutoRunCode(card.autoRunError)
            ? card.autoRunError
            : 'unknown',
          message: card.autoRunMessage ?? '',
          at: card.autoRunFailedAt.toISOString(),
          after: card.autoRunAfter,
          stack: card.autoRunStack,
        }
      : null,
  autoRunWhenReady: card.autoRunWhenReady,
  readiness: cardReadiness(card.column, facts.dependencies.get(card.id) ?? []),
  stack: facts.stacks?.get(card.id) ?? null,
  queue: facts.queue?.get(card.id) ?? null,
  tracking: trackingOf(card, facts),
  taken: takenOf(card, facts),
  queuedForSessionId: card.queuedForSessionId,
  fleet: fleetOf(card),
  autoCollect: card.autoCollect,
  movedAt: card.movedAt.toISOString(),
  completedAt: iso(card.completedAt),
  updatedAt: card.updatedAt.toISOString(),
  attachmentCount: facts.attachmentCounts.get(card.id) ?? 0,
  dependsOn: facts.dependencies.get(card.id) ?? [],
  planId: card.planId,
  steward: stewardChipOf(card, facts),
  ...restartOf(card, facts),
  escalated: card.escalatedAt !== null,
  ...taskOf(card, facts),
});

/**
 * C-509 (ADR-0127): a task's assignee, checklist count, Done note and the
 * card that raised it. Other kinds carry none of these fields.
 */
const taskOf = (
  card: Pick<CardFace, 'id' | 'kind' | 'taskNote'>,
  facts: CardFacts,
): Pick<BoardCardView, 'assignee' | 'checklist' | 'taskNote' | 'raisedFor'> => {
  if (card.kind !== 'task') return {};
  const fact = facts.tasks?.get(card.id);
  return {
    assignee: fact?.assignee ?? null,
    checklist: fact?.checklist ?? { done: 0, total: 0 },
    taskNote: card.taskNote,
    raisedFor: fact?.raisedFor ?? null,
  };
};

/** C-509: a task's checklist items, as its detail lists them. */
const checklistItemsOf = (
  rows: readonly CardChecklistRow[] | undefined,
): TaskChecklistItemView[] =>
  [...(rows ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      text: item.text,
      position: item.position,
      doneAt: iso(item.doneAt),
      doneBy:
        item.doneBy === null
          ? null
          : { id: item.doneBy.id, name: item.doneBy.name ?? item.doneBy.email },
    }));

const isEvidence = (value: Prisma.JsonValue): value is Prisma.JsonObject =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof value.contentId === 'string' &&
  (value.kind === 'prompt' || value.kind === 'response') &&
  typeof value.excerpt === 'string';

/** #244 D8: `board_cards.evidence`; `null` when there is none. */
const evidenceOf = (
  json: Prisma.JsonValue | null,
): CardEvidenceView[] | null =>
  Array.isArray(json)
    ? json.filter(isEvidence).map((e) => ({
        contentId: String(e.contentId),
        kind: e.kind === 'prompt' ? 'prompt' : 'response',
        excerpt: String(e.excerpt),
      }))
    : null;

/** #837: what a round pushed, as `CardRoundView` shows it. */
export type CardRoundPush = Pick<
  CardRoundView,
  'pullRequest' | 'headSha' | 'commits' | 'ci'
>;

const NO_PUSH: CardRoundPush = {
  pullRequest: null,
  headSha: null,
  commits: null,
  ci: null,
};

/** #837: a head with no checks (`none`) shows none. */
const ROUND_CI_STATE: Record<Exclude<CardCiState, 'none'>, CardRoundCiState> = {
  pending: 'pending',
  green: 'passed',
  red: 'failed',
};

/**
 * #837: each round's pull request, head, commits and checks, for `rounds`
 * oldest first. A round's commits are its head's `headAhead` less the one
 * the round before it on the same PR left — unknown when either is. A round
 * recorded before #837, or one that pushed nothing, has no head: all null.
 */
export const roundPushesOf = (
  rounds: readonly Pick<
    BoardCardRound,
    | 'prNumber'
    | 'prUrl'
    | 'headSha'
    | 'headAhead'
    | 'ciState'
    | 'ciPassed'
    | 'ciTotal'
  >[],
): CardRoundPush[] => {
  const aheadByPr = new Map<number, number | null>();
  return rounds.map((round) => {
    const { headSha, prNumber, prUrl } = round;
    if (headSha === null || prNumber === null || prUrl === null) {
      return { ...NO_PUSH, headSha };
    }
    const before = aheadByPr.has(prNumber) ? aheadByPr.get(prNumber) : 0;
    aheadByPr.set(prNumber, round.headAhead);
    const commits =
      round.headAhead !== null &&
      before !== null &&
      before !== undefined &&
      round.headAhead >= before
        ? round.headAhead - before
        : null;
    const state =
      round.ciState === null || round.ciState === 'none'
        ? null
        : ROUND_CI_STATE[round.ciState];
    return {
      pullRequest: { number: prNumber, url: prUrl },
      headSha,
      commits,
      ci:
        state === null
          ? null
          : {
              state,
              passed: round.ciPassed ?? 0,
              total: round.ciTotal ?? 0,
              url: commitChecksUrl(prUrl, headSha),
            },
    };
  });
};

const toRoundView = (
  card: BoardCard,
  round: BoardCardRound & { author: BoardUserRef | null },
  facts: CardFacts,
  push: CardRoundPush = NO_PUSH,
): CardRoundView => ({
  id: round.id,
  round: round.round,
  runId: round.runId,
  trigger: round.trigger,
  feedback: round.feedback,
  author: round.author,
  phase: round.phase,
  tmuxSession: round.tmuxSession,
  finishedBy: round.finishedBy,
  summary: round.summary,
  exitCode: round.exitCode,
  error: round.error,
  hooksMissing: hooksMissing(card, round, facts),
  ...hooksCauseOf(card, round, facts),
  ...wiringOf(round),
  autoRunAfter: round.autoRunAfter,
  escalation: round.escalation,
  model: round.model,
  effort: round.effort,
  finishRefused: finishRefusedOf(round),
  blockingDialog: blockingDialogOf(round),
  costUsd: facts.costs.get(round.runId) ?? null,
  tokenSaved: facts.tokenSaver.tokenSaved.get(round.runId) ?? null,
  tokenSaverFilters: facts.tokenSaver.tokenSaverFilters.get(round.runId) ?? [],
  artifactIncomplete: facts.tokenSaver.artifactIncomplete.has(round.runId),
  startedAt: round.startedAt.toISOString(),
  waitingAt: iso(round.waitingAt),
  backgroundAt: iso(round.backgroundAt),
  backgroundCommand: round.backgroundCommand,
  finishedAt: iso(round.finishedAt),
  endedAt: iso(round.endedAt),
  restartMode: round.restartMode,
  pausedFor: round.pausedFor,
  restartEstimate: restartEstimateOf(round.restartEstimate),
  warmupTokens: round.warmupTokens,
  warmupMs: round.warmupMs,
  ...push,
});

/**
 * #322 D6, #750 D1–D3: the card's recommendation, with the stored class and
 * signals on the work one. In the B arm of `model-by-type` (`byType`) the
 * work model and effort are the class mapping — what Run defaults to — so
 * a choice equal to it is no override (D5).
 */
export const recommendationOf = (
  card: CardWithRounds,
  byType: CardModelByTypeArm | null,
): CardRecommendationView => {
  const recommendation = cardRecommendationOf(card);
  const work = recommendation.work;
  if (!work) return recommendation;
  const mapped = byType
    ? modelByType(byType.workClass, work.effort, false)
    : null;
  return {
    ...recommendation,
    work: {
      ...work,
      ...(mapped ?? {}),
      class: card.workClass,
      signals: card.workSignals.filter(isDecidingSignal),
    },
  };
};

const isDecidingSignal = (signal: string): signal is CardDecidingSignal =>
  (CARD_DECIDING_SIGNALS as readonly string[]).includes(signal);

/** #750 D9: the card's one escalation; `null` while it never escalated. */
export const escalationOf = (
  card: Pick<BoardCard, 'escalatedAt' | 'escalationReason' | 'escalationNote'>,
): CardEscalationView | null =>
  card.escalatedAt !== null && card.escalationReason !== null
    ? {
        reason: card.escalationReason,
        note: card.escalationNote ?? '',
        at: card.escalatedAt.toISOString(),
      }
    : null;

/** The card's rounds, oldest first, each with what it pushed (#837). */
const roundsOf = (card: CardWithPeople, facts: CardFacts): CardRoundView[] => {
  const rounds = [...card.rounds].sort((a, b) => a.round - b.round);
  const pushes = roundPushesOf(rounds);
  return rounds.map((round, i) => toRoundView(card, round, facts, pushes[i]));
};

/** `attachments`: the card's and its rounds', oldest first (#309). */
export const toCardDetail = (
  card: CardWithPeople,
  facts: CardFacts,
  attachments: AttachmentView[],
  /** #750 D3: the card's B arm of `model-by-type`; `null` is arm A. */
  byType: CardModelByTypeArm | null = null,
): BoardCardDetail => ({
  ...toCardView(card, facts),
  body: card.body,
  issueOnRun: card.issueOnRun,
  specOnRun: card.specOnRun,
  model: card.model,
  effort: card.effort,
  profileKey: card.profileKey,
  designModel: card.designModel,
  recommendation: recommendationOf(card, byType),
  escalation: escalationOf(card),
  branch: card.branch,
  worktree: card.worktree,
  specPath: card.specPath,
  specPr:
    card.specRepo !== null &&
    card.specPrNumber !== null &&
    card.specPrUrl !== null
      ? {
          repo: card.specRepo,
          number: card.specPrNumber,
          url: card.specPrUrl,
        }
      : null,
  sessionId: card.sessionId,
  sessionMessageRefusal: facts.messagesRefused?.get(card.projectId) ?? null,
  sessionModel: card.sessionModel,
  sessionEffort: card.sessionEffort,
  createdBy: card.createdBy,
  movedBy: card.movedBy,
  completedBy: card.completedBy,
  createdAt: card.createdAt.toISOString(),
  rounds: roundsOf(card, facts),
  pullRequests: pullRequestsOf(card.pullRequests),
  evidence: evidenceOf(card.evidence),
  attachments,
  analysis: analysisOf(card),
  origin: card.originCard ?? null,
  ...(card.kind === 'task'
    ? { checklistItems: checklistItemsOf(card.checklist) }
    : {}),
});

/**
 * No row is the defaults (`isDefault: true`). #359 D7: `baseBranch` is the
 * project's base and `defaultBranch` the repository's, where known
 * (`BoardProject.defaultBranch`); they decide `autoMergeCardsDefault`.
 * Without a base the default reads as off, the safe side.
 */
export const toSettingsView = (
  projectId: string,
  row: BoardSettings | null,
  baseBranch: string | null = null,
  defaultBranch: string | null = null,
): BoardSettingsView => {
  const autoMergeCardsDefault =
    baseBranch !== null && cardAutoMergeDefault(baseBranch, defaultBranch);
  return row
    ? {
        projectId,
        issueOnRun: row.issueOnRun,
        specOnRun: row.specOnRun,
        maxRunning: row.maxRunning,
        captureEnabled: row.captureEnabled,
        captureModel: isCaptureModel(row.captureModel)
          ? row.captureModel
          : CAPTURE_MODEL_DEFAULT,
        autoCollectTracked: row.autoCollectTracked,
        autoMergeCards: row.autoMergeCards,
        autoMergeCardsDefault,
        backgroundStallMinutes: row.backgroundStallMinutes,
        cardMergePolicy: row.cardMergePolicy,
        isDefault: false,
        updatedAt: row.updatedAt.toISOString(),
      }
    : {
        projectId,
        issueOnRun: false,
        specOnRun: false,
        maxRunning: BOARD_MAX_RUNNING_DEFAULT,
        captureEnabled: false,
        captureModel: CAPTURE_MODEL_DEFAULT,
        autoCollectTracked: false,
        autoMergeCards: null,
        autoMergeCardsDefault,
        backgroundStallMinutes: CARD_BACKGROUND_STALL_MINUTES_DEFAULT,
        cardMergePolicy: CARD_MERGE_POLICY_DEFAULT,
        isDefault: true,
        updatedAt: null,
      };
};
