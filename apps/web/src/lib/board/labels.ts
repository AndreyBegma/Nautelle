import type { Hue } from '@andrewbehma/glass-ui/hue';
import {
  type CardLabelView,
  LABEL_HUE_MAX,
  LABEL_HUE_MIN,
  type ProjectLabelsResponse,
  type SetCardLabelsRequest,
} from '@nautelle/shared';
import { api } from '../api';

/** A stored hue is 1–8 (ADR-0125); anything else falls back to the first. */
export const asHue = (hue: number): Hue =>
  (Number.isInteger(hue) && hue >= LABEL_HUE_MIN && hue <= LABEL_HUE_MAX
    ? hue
    : LABEL_HUE_MIN) as Hue;

const project = (projectId: string) =>
  `/projects/${encodeURIComponent(projectId)}`;

export const fetchProjectLabels = (projectId: string) =>
  api<ProjectLabelsResponse>(`${project(projectId)}/labels`);

/** The person's truth: each listed label becomes theirs, each left out a removal. */
export const setCardLabels = (
  projectId: string,
  number: number,
  body: SetCardLabelsRequest,
) =>
  api<CardLabelView[]>(`${project(projectId)}/board/cards/${number}/labels`, {
    method: 'PUT',
    body,
  });

/** The tooltip of the "auto" marker: where an automatic label came from. */
export const AUTO_LABEL_HINT: Record<'model' | 'paths', string> = {
  model: 'Suggested from the title',
  paths: "From the pull request's files",
};
