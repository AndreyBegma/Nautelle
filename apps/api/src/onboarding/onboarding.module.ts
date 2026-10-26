import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects';
import {
  MyOnboardingController,
  OnboardingController,
} from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/** Getting started on the Overview, through to a first card (C-396, C-476). */
@Module({
  imports: [ProjectsModule],
  controllers: [OnboardingController, MyOnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
