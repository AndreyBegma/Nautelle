import {
  SLACK_EVENTS,
  SLACK_WEBHOOK_URL_MAX,
  type SlackEvent,
  type SlackWebhookUpdate,
} from '@nautelle/shared';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * `PUT /projects/:projectId/slack` and `PUT /admin/integrations/slack`. The
 * URL's shape is checked by the service (`isSlackWebhookUrl`), so its error
 * names what a Slack webhook URL looks like.
 */
export class UpdateSlackWebhookDto implements SlackWebhookUpdate {
  @IsOptional()
  @IsString()
  @MaxLength(SLACK_WEBHOOK_URL_MAX)
  url?: string;

  @IsArray()
  @ArrayMaxSize(SLACK_EVENTS.length)
  @ArrayUnique()
  @IsIn(SLACK_EVENTS, { each: true })
  events!: SlackEvent[];
}
