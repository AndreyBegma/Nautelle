import type { FleetsView } from '@nautelle/shared';
import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-request';
import { CurrentUser } from '../auth/decorators';
import { ProjectAccessService } from '../projects';
import { FleetQueryService } from './fleet-query.service';

/**
 * The fleet of every project the caller can see, in one call (C-388): the
 * Projects list and the Overview read it instead of one `/fleet` per project.
 * Visibility is the project list's (D11): admins all, others their memberships.
 */
@Controller('fleet')
export class FleetsController {
  constructor(
    private readonly fleet: FleetQueryService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get()
  fleets(@CurrentUser() user: AuthUser): Promise<FleetsView> {
    return this.fleet.fleets(this.access.visibleWhere(user));
  }
}
