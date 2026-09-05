import type { ControlState } from '$lib/actions/action-model';
import type { ProjectSummary } from '$lib/storage';

export type ProjectDialogMode = 'list' | 'create' | 'edit' | 'delete';

export type ProjectDialogState = {
  mode: ProjectDialogMode;
  name: string;
  published: boolean;
  busy: boolean;
  targetId?: string;
  error?: string;
};

export type ProjectDialogViewModel = {
  dialog: ProjectDialogState;
  projects: readonly ProjectSummary[];
  activeProjectId?: string;
  publishedProjectId?: string;
  publicationState: ControlState;
};

export type ProjectDialogIntent =
  | { type: 'close' }
  | { type: 'new' }
  | { type: 'back' }
  | { type: 'select'; projectId: string }
  | { type: 'edit'; projectId: string }
  | { type: 'delete'; projectId: string }
  | { type: 'name-change'; name: string }
  | { type: 'publication-change'; published: boolean }
  | { type: 'submit-create' }
  | { type: 'submit-edit' }
  | { type: 'submit-delete' };
