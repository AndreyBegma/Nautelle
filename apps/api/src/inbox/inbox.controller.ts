import type { InboxView } from '@nautelle/shared';
import { Controller, Get } from '@nestjs/common';
import { type AuthUser, CurrentUser } from '../auth';
import { InboxService } from './inbox.service';

/**
 * The Inbox (C-390, ADR-0106): what waits on the caller across their
 * projects. Any signed-in user; a project contributes only where they are
 * operator or higher.
 */
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<InboxView> {
    return this.inbox.view(user);
  }
}
