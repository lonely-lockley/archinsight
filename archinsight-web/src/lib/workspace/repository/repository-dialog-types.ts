import type { RepositoryDialogTarget } from './repository-paths';

export type FileDialogMode = 'save' | 'new' | 'rename';

export type FileDialogState = {
  mode: FileDialogMode;
  target: RepositoryDialogTarget;
  title: string;
  directory: string;
  fileName: string;
  sourcePath?: string;
  tabId?: string;
  content?: string;
  error?: string;
};

export type DeleteDialogState = {
  path: string;
  target: RepositoryDialogTarget;
  error?: string;
};

