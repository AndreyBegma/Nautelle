import { Module } from '@nestjs/common';
import { BoardAttachmentsController } from '../attachments/board-attachments.controller';
import { DemosModule } from '../demos/demos.module';
import { LiveModule } from '../live/live.module';
import { ProjectsModule } from '../projects';
import { ReadinessModule } from '../readiness';
import { RunnersModule } from '../runners/runners.module';
import { SessionMessageModule } from '../session-message/session-message.module';
import { BoardController } from './board.controller';
import { BoardService, FleetCardEditsRef } from './board.service';
import { BoardAnalysis } from './board-analysis';
import { BoardAutoRun } from './board-auto-run';
import { BoardBackgroundStall } from './board-background-stall';
import { BoardBudgetPause } from './board-budget-pause';
import { BoardBulk } from './board-bulk';
import { BoardCommands } from './board-commands';
import { BoardDependencies } from './board-dependencies.service';
import { BoardFixWaits } from './board-fix-waits';
import { BoardInboxService } from './board-inbox.service';
import { BoardLabelsController } from './board-labels.controller';
import { BoardLabels, CardLabelSuggestRef } from './board-labels.service';
import { BoardPathLabels } from './board-path-labels';
import { BoardPlanCards } from './board-plan-cards';
import { BoardPrincipals } from './board-principal';
import { BoardProposals } from './board-proposals.service';
import { BoardReview } from './board-review';
import { BoardRoundsService } from './board-rounds.service';
import { BoardRunQueue } from './board-run-queue';
import { BoardSessionService } from './board-session.service';
import { BoardSessionMessages } from './board-session-message.service';
import { BoardShipping } from './board-shipping';
import { BoardSink } from './board-sink';
import { BoardStacks } from './board-stacks';
import { BoardTerminalService } from './board-terminal.service';
import { BoardWaitService } from './board-wait.service';
import { BoardWork } from './board-work';
import { CollectRetryTimer } from './collect-retry-timer';
import { PathLabelsRef } from './path-labels-ref';

/**
 * The project Board (issue #242, ADR-0024): cards Nautelle owns, each worked
 * by a dedicated interactive Claude Code worker outside the orchestrator.
 * `BoardService` is exported for the local `card.finish` method (D6) and for
 * the fleet's `FleetCardEdits` port (#282 D4, set on `FleetCardEditsRef`);
 * `BoardTerminalService` for `card.track` (#282 D1).
 */
@Module({
  // #309: `AttachmentsService` comes from the global `AttachmentsModule`.
  imports: [
    // C-370: a feature card's green head is recorded as a demo video.
    DemosModule,
    LiveModule,
    ProjectsModule,
    ReadinessModule,
    RunnersModule,
    SessionMessageModule,
  ],
  // #309: claiming attachments onto a card is a card route.
  // C-497: card labels are their own routes.
  controllers: [
    BoardController,
    BoardAttachmentsController,
    BoardLabelsController,
  ],
  providers: [
    // C-503: an analysis card's finish — a report and proposed cards.
    BoardAnalysis,
    // #443: accepting a card may start the Run of a card that waited for it.
    BoardAutoRun,
    // #390: a round stuck on its own background task raises one warning.
    BoardBackgroundStall,
    // C-399: a reached hard budget pauses the running rounds in its scope.
    BoardBudgetPause,
    // #452: one action for several cards.
    BoardBulk,
    BoardCommands,
    BoardDependencies,
    // C-418: fix rounds refused for room go before To Do when a slot frees.
    BoardFixWaits,
    BoardInboxService,
    // C-497: a project's card labels and the one way automation writes them.
    BoardLabels,
    BoardPlanCards,
    BoardProposals,
    // C-181: whom an automatic round runs as.
    BoardPrincipals,
    // #884: review steps gate Finished on a card's green PR.
    BoardReview,
    BoardRoundsService,
    BoardService,
    // #489: a person's message to a card's running session.
    BoardSessionMessages,
    // #845: a person's session works the Board through MCP.
    BoardSessionService,
    BoardWaitService,
    // #359: a card ships itself — CI watched, fixed, merged.
    BoardShipping,
    BoardSink,
    // #652: Run stack — a stack's cards queued within the agent limit.
    BoardRunQueue,
    // #480: stacks — staged cards under one shared design.
    BoardStacks,
    BoardTerminalService,
    BoardWork,
    BoardPathLabels,
    CardLabelSuggestRef,
    CollectRetryTimer,
    PathLabelsRef,
    FleetCardEditsRef,
  ],
  // `BoardRoundsService` too: approving a card's design may start round 1 (#243 D6).
  // `BoardWork`: card capture puts suggestions in the Inbox (#244).
  // `BoardPlanCards`: a card intake and Create cards make cards (#337 D6, D7).
  // `BoardSessionMessages`: Telegram answers a card's question (#489).
  // `BoardStacks`: a confirmed intake makes a stack (#480).
  // `BoardReview`: a review session's `report_review` (#884).
  // `BoardDependencies`, `BoardRunQueue`: a person's session sets them (C-377).
  exports: [
    // C-503: the local `card.finishAnalysis` method.
    BoardAnalysis,
    // #578: the Telegram bot accepts and dismisses suggestions.
    BoardDependencies,
    BoardInboxService,
    // C-500, C-501: the model's suggestion and the path rules label cards.
    BoardLabels,
    BoardPlanCards,
    BoardReview,
    BoardRoundsService,
    BoardSessionMessages,
    BoardService,
    BoardSessionService,
    BoardRunQueue,
    BoardStacks,
    BoardTerminalService,
    BoardWaitService,
    BoardWork,
    CardLabelSuggestRef,
    FleetCardEditsRef,
  ],
})
export class BoardModule {}
