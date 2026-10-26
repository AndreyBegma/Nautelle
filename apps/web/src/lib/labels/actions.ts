import type {
  BoardSettingsView,
  CreateProjectLabelRequest,
  LabelPathRuleView,
  ProjectLabelsResponse,
  ProjectLabelView,
  ReplaceLabelRulesRequest,
  UpdateBoardSettingsRequest,
  UpdateProjectLabelRequest,
} from '@nautelle/shared';
import { api } from '../api';
import { switchesRequest } from './settings';

/** `/projects/:id/labels` (ADR-0125): members read, a project admin writes. */
const base = (projectId: string) =>
  `/projects/${encodeURIComponent(projectId)}/labels`;

export const fetchLabels = (projectId: string) =>
  api<ProjectLabelsResponse>(base(projectId));

export const createLabel = (
  projectId: string,
  body: CreateProjectLabelRequest,
) => api<ProjectLabelView>(base(projectId), { method: 'POST', body });

export const updateLabel = (
  projectId: string,
  labelId: string,
  body: UpdateProjectLabelRequest,
) =>
  api<ProjectLabelView>(`${base(projectId)}/${encodeURIComponent(labelId)}`, {
    method: 'PATCH',
    body,
  });

export const deleteLabel = (projectId: string, labelId: string) =>
  api<void>(`${base(projectId)}/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });

/** Replaces the whole ordered list of path rules. */
export const replaceLabelRules = (
  projectId: string,
  body: ReplaceLabelRulesRequest,
) =>
  api<LabelPathRuleView[]>(`${base(projectId)}/rules`, { method: 'PUT', body });

/** The two automatic-labelling switches live in the Board's settings. */
export const saveLabelSwitches = async (
  projectId: string,
  change: Pick<UpdateBoardSettingsRequest, 'labelSuggest' | 'labelPaths'>,
) => {
  const path = `/projects/${encodeURIComponent(projectId)}/board-settings`;
  const current = await api<BoardSettingsView>(path);
  return api<BoardSettingsView>(path, {
    method: 'PUT',
    body: switchesRequest(current, change),
  });
};
