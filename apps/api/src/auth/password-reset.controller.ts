import type {
  PasswordResetCheckResponse,
  PasswordResetOptions,
  PasswordResetResponse,
} from '@nautelle/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { requestOrigin } from '../audit/audit-context';
import { SourceThrottledFilter } from './auth-error';
import { setSessionCookies } from './cookies';
import { Public } from './decorators';
import {
  ForgotPasswordDto,
  PasswordResetCheckDto,
  PasswordResetDto,
} from './dto';
import { PasswordResetService } from './password-reset.service';

/**
 * C-402 (ADR-0113): Forgot password and the reset link, for people who cannot
 * sign in. Every route is public and limited per IP like login; the requests
 * and the tokens are on the login counter too (ADR-0048).
 */
@Public()
@Controller('auth/password-reset')
@UseFilters(SourceThrottledFilter)
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Get()
  options(): PasswordResetOptions {
    return { selfService: this.resets.selfService };
  }

  /** 202 whether or not the address has an account. */
  @UseGuards(ThrottlerGuard)
  @Post('request')
  @HttpCode(202)
  async request(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.resets.request(dto.email, requestOrigin(request));
  }

  @UseGuards(ThrottlerGuard)
  @Post('check')
  @HttpCode(200)
  check(
    @Body() dto: PasswordResetCheckDto,
    @Req() request: Request,
  ): Promise<PasswordResetCheckResponse> {
    return this.resets.check(dto.token, requestOrigin(request));
  }

  /** Sets the new password and signs the person in, ending their other sessions. */
  @UseGuards(ThrottlerGuard)
  @Post()
  @HttpCode(200)
  async reset(
    @Body() dto: PasswordResetDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PasswordResetResponse> {
    const { user, session } = await this.resets.redeem(
      dto,
      requestOrigin(request),
    );
    setSessionCookies(response, session);
    return user;
  }
}
