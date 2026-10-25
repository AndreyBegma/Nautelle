import type {
  DesignApproveRequest,
  DesignCommentRequest,
  DesignCommentView,
} from '@nautelle/shared';
import { api } from '../api';
import { cardDesignApi } from '../design/href';

/**
 * A card design's decisions from an Inbox row (C-390): the same routes the
 * design viewer's `useCardDesign` sends, without loading the whole design for
 * every row.
 */

export const approveCardDesign = (
  projectId: string,
  number: number,
  body: DesignApproveRequest,
) =>
  api(`${cardDesignApi(projectId, number)}/approve`, { method: 'POST', body });

export const commentCardDesign = (
  projectId: string,
  number: number,
  body: DesignCommentRequest,
) =>
  api<DesignCommentView>(`${cardDesignApi(projectId, number)}/comments`, {
    method: 'POST',
    body,
  });

/** A new revision that reads the open comments. */
export const reviseCardDesign = (projectId: string, number: number) =>
  api(`${cardDesignApi(projectId, number)}/revise`, { method: 'POST' });
