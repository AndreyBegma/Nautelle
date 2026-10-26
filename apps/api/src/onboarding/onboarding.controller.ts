import type { MyOnboardingFacts, OnboardingFacts } from '@nautelle/shared';
import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-request';
import { CurrentUser, Roles } from '../auth/decorators';
import { OnboardingService } from './onboarding.service';

/** C-396: `GET /admin/onboarding` — what Getting started ticks from. */
@Roles('admin')
@Controller('admin/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  facts(): Promise<OnboardingFacts> {
    return this.onboarding.facts();
  }
}

/**
 * C-476: `GET /onboarding/me` — the caller's own steps. Viewers get no
 * Getting started, so they are refused.
 */
@Roles('admin', 'operator')
@Controller('onboarding/me')
export class MyOnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser): Promise<MyOnboardingFacts> {
    return this.onboarding.mine(user);
  }
}
