import {
  ADMIN_USERS_SEARCH_MAX,
  type ApproveUserRequest,
  type RegistrationState,
  ROLES,
  type Role,
  type UpdateUserRequest,
  USER_STATUSES,
  type UserStatus,
} from '@nautelle/shared';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ListUsersQuery {
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  /** Matches part of the email or the name, ignoring case. */
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_USERS_SEARCH_MAX)
  q?: string;

  /** `nextCursor` of the previous page. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class ApproveUserDto implements ApproveUserRequest {
  @IsIn(ROLES)
  role!: Role;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}

export class RegistrationStateDto implements RegistrationState {
  @IsBoolean()
  open!: boolean;
}
