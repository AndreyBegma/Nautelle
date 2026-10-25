import type { OnboardingFacts } from '@nautelle/shared';
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators';
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
