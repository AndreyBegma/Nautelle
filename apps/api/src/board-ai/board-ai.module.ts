import { Module } from '@nestjs/common';
import { AssistantModels } from '../assistant/assistant-models';
import { BoardModule } from '../board/board.module';
import { LlmModule } from '../llm/llm.module';
import { PricesModule } from '../prices/prices.module';
import { ProjectsModule } from '../projects';
import {
  BoardAskController,
  BoardTriageController,
} from './board-ai.controller';
import { BoardAiModel } from './board-ai-model';
import { BoardAskService } from './board-ask.service';
import { BoardQuickDraft } from './board-quick-draft.service';
import { BoardTriage } from './board-triage.service';

/**
 * #660: Ask the Board and triage hints, on the LLM gateway (ADR-0059) with
 * the feature tags `search` and `triage`. The intake and the assistant import
 * it to triage the cards they make. C-391: Quick card's title and kind, tagged
 * `title`; `AssistantModels` is provided here too (it only reads the LLM store
 * and the price table) because the assistant module imports this one.
 */
@Module({
  imports: [LlmModule, PricesModule, BoardModule, ProjectsModule],
  controllers: [BoardAskController, BoardTriageController],
  providers: [
    BoardAiModel,
    BoardAskService,
    BoardTriage,
    AssistantModels,
    BoardQuickDraft,
  ],
  exports: [BoardTriage],
})
export class BoardAiModule {}
