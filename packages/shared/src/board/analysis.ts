import { z } from 'zod';

/**
 * C-503 (ADR-0126): an analysis card investigates read-only and ends with a
 * report and proposed cards instead of a pull request. The worker sends both
 * through `finish_analysis` (`card.finishAnalysis`); the person turns the
 * proposals into cards with Create selected (C-506).
 */

/** The report, markdown; stored on the round as `report`. */
export const ANALYSIS_REPORT_MAX = 20_000;
/** Proposals one finish may carry. */
export const CARD_PROPOSALS_MAX = 20;
export const CARD_PROPOSAL_TITLE_MAX = 200;
/** A proposal's body, markdown. */
export const CARD_PROPOSAL_BODY_MAX = 8_000;
export const CARD_PROPOSAL_LABELS_MAX = 5;
export const CARD_PROPOSAL_LABEL_MAX = 40;

/**
 * D2, D4: a proposal's kind — its own enum, not `BoardCardKind`, so a `task`
 * proposal is stored whether or not the project has the `task` card kind.
 */
export const CARD_PROPOSAL_KINDS = ['feature', 'bug', 'task'] as const;
export type CardProposalKind = (typeof CARD_PROPOSAL_KINDS)[number];

/** `pending` until Create selected makes a card of it or dismisses it. */
export const CARD_PROPOSAL_STATUSES = [
  'pending',
  'created',
  'dismissed',
] as const;
export type CardProposalStatus = (typeof CARD_PROPOSAL_STATUSES)[number];

/**
 * One proposal as the worker sends it. `dependsOn` names positions (0-based
 * indexes in `proposals`) of earlier proposals only, so the graph is acyclic
 * by construction.
 */
export const cardProposalInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(CARD_PROPOSAL_TITLE_MAX),
  body: z.string().trim().min(1).max(CARD_PROPOSAL_BODY_MAX),
  kind: z.enum(CARD_PROPOSAL_KINDS),
  labels: z
    .array(z.string().trim().min(1).max(CARD_PROPOSAL_LABEL_MAX))
    .max(CARD_PROPOSAL_LABELS_MAX)
    .optional(),
  dependsOn: z
    .array(z.number().int().nonnegative())
    .max(CARD_PROPOSALS_MAX)
    .optional(),
});
export type CardProposalInput = z.infer<typeof cardProposalInputSchema>;

/** The proposals of one finish; every `dependsOn` names an earlier position. */
export const cardProposalsInputSchema = z
  .array(cardProposalInputSchema)
  .max(CARD_PROPOSALS_MAX)
  .superRefine((proposals, ctx) => {
    proposals.forEach((proposal, position) => {
      const dependsOn = proposal.dependsOn ?? [];
      if (new Set(dependsOn).size !== dependsOn.length) {
        ctx.addIssue({
          code: 'custom',
          message: `proposal ${position} names a dependency twice`,
          path: [position, 'dependsOn'],
        });
      }
      dependsOn.forEach((dependency, index) => {
        if (dependency >= position) {
          ctx.addIssue({
            code: 'custom',
            message: `proposal ${position} may depend only on earlier proposals`,
            path: [position, 'dependsOn', index],
          });
        }
      });
    });
  });

/**
 * The round's `summary` for a report: its first paragraph, at most `max`
 * characters.
 */
export const analysisReportSummary = (report: string, max: number): string => {
  const trimmed = report.trim();
  const paragraph = trimmed.split(/\n\s*\n/, 1)[0] ?? trimmed;
  return paragraph.trim().slice(0, max);
};

/** A proposal as the card sheet shows it (C-507). */
export interface CardProposalView {
  position: number;
  title: string;
  body: string;
  kind: CardProposalKind;
  labels: string[];
  dependsOn: number[];
  status: CardProposalStatus;
  /** The card Create selected made of it; `null` until then or once deleted. */
  createdCard: { number: number; title: string } | null;
}

/** `BoardCardDetail.analysis`: an analysis card's latest report and its proposals. */
export interface CardAnalysisView {
  /** The latest round's report; `null` before the first finish. */
  report: string | null;
  /** The round the report came from — Create selected names it (C-506). */
  roundId: string | null;
  /** The card's proposals: the latest round's, then the decided ones of earlier rounds. */
  proposals: CardProposalView[];
}

/** C-506: the columns Create selected may put the new cards in. */
export const CARD_PROPOSAL_TARGET_COLUMNS = ['todo', 'inbox'] as const;
export type CardProposalTargetColumn =
  (typeof CARD_PROPOSAL_TARGET_COLUMNS)[number];

/** C-506: `POST board/cards/:number/proposals/create`. */
export interface CreateCardProposalsRequest {
  /** Distinct positions of `pending` proposals, 1–`CARD_PROPOSALS_MAX`. */
  positions: number[];
  column: CardProposalTargetColumn;
  /** The round the person saw; another is `409 proposals_stale`. */
  roundId: string;
}
