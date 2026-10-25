import { Module } from '@nestjs/common';
import { BoardModule } from '../board';
import { ProjectsModule } from '../projects';
import { ReadinessModule } from '../readiness';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

/**
 * The Inbox (C-390, ADR-0101): one read route over board cards, action
 * requests and project readiness. It writes nothing — each item's action is
 * the route that already owns it.
 */
@Module({
  imports: [BoardModule, ProjectsModule, ReadinessModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
