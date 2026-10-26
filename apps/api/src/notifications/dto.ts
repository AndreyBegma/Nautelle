import {
  AI_DIGEST_TIME_PATTERN,
  EMAIL_MODES,
  type EmailMode,
  NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_MAX,
  type NotificationEmailSettings,
  type NotificationKind,
  type NotificationMuteUpdate,
  type NotificationRulesUpdate,
} from '@nautelle/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** `?unread=true|false` — anything else is refused, not read as false. */
const queryBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** `GET /notifications`. */
export class NotificationListQueryDto {
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_PAGE_MAX)
  limit?: number;
}

export class NotificationRuleDto {
  @IsIn(NOTIFICATION_KINDS)
  kind!: NotificationKind;

  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  telegram!: boolean;

  /** C-404: absent keeps the stored mode; null goes back to the default. */
  @IsOptional()
  @IsIn(EMAIL_MODES)
  email?: EmailMode | null;
}

/** `PUT /notifications/rules`. */
export class NotificationRulesDto implements NotificationRulesUpdate {
  @IsArray()
  @ArrayMaxSize(NOTIFICATION_KINDS.length)
  @ValidateNested({ each: true })
  @Type(() => NotificationRuleDto)
  rules!: NotificationRuleDto[];
}

/** `PUT /notifications/mutes/:projectId` — `until` absent or null: until removed. */
export class NotificationMuteDto implements NotificationMuteUpdate {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true })
  until?: string | null;
}

/** `PUT /notifications/email` — when the caller's daily digest goes out (C-404). */
export class NotificationEmailSettingsDto implements NotificationEmailSettings {
  @IsString()
  @Matches(AI_DIGEST_TIME_PATTERN, { message: 'digestTime must be HH:MM' })
  digestTime!: string;

  @IsString()
  @MaxLength(64)
  @IsTimeZone()
  timezone!: string;
}
