import {
  ACTION_REQUEST_NOTE_MAX,
  type ActionRequestDecision,
  type ActionRequestStatus,
  actionRequestStatusSchema,
  TOOL_RULE_SCOPES,
  type ToolRuleScope,
} from '@nautelle/shared';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** `GET /projects/:projectId/action-requests?status`. */
export class ActionRequestsListQuery {
  @IsOptional()
  @IsIn(actionRequestStatusSchema.options)
  status?: ActionRequestStatus;
}

/** `POST /projects/:projectId/action-requests/:id/approve|deny`. */
export class ActionRequestDecisionDto implements ActionRequestDecision {
  @IsOptional()
  @IsString()
  @MaxLength(ACTION_REQUEST_NOTE_MAX)
  note?: string;

  /** C-401: approve of a `tool_use` only — also allow similar calls. */
  @IsOptional()
  @IsIn(TOOL_RULE_SCOPES)
  remember?: ToolRuleScope;
}
