export type ProjectSummaryResponse = {
  id: string;
  name: string;
};

export type ProjectListResponse = {
  projects: ProjectSummaryResponse[];
};

export type FileTreeNode = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children: FileTreeNode[];
};

export type FileTreeResponse = {
  root: FileTreeNode;
};

export type FileContentResponse = {
  path: string;
  content: string;
  readOnly: boolean;
  revision: string;
};

export type FileSaveRequest = {
  content?: string | null;
  level?: string | null;
  projectIdentifier?: string | null;
};

export type FileRenameRequest = {
  sourcePath?: string | null;
  targetPath?: string | null;
};

export type FolderCreateRequest = {
  path?: string | null;
};

export type FileOperationResponse = {
  path: string;
  revision: string;
};

export type RepositoryNode = {
  id: string;
  parentId: string | null;
  name: string;
  type: 'd' | 'f';
  childNodes: RepositoryNode[];
};

export type RepositoryProjectSeed = {
  id: string;
  name: string;
  structure?: RepositoryNode;
  files?: Record<string, string>;
};

export interface RepositoryFileSystem {
  projects(ownerId: string): Promise<ProjectSummaryResponse[]>;
  tree(ownerId: string, projectId: string): Promise<FileTreeResponse>;
  read(ownerId: string, projectId: string, path: string): Promise<FileContentResponse>;
  save(
    ownerId: string,
    projectId: string,
    path: string,
    request: FileSaveRequest | null
  ): Promise<FileOperationResponse>;
  rename(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse>;
  delete(ownerId: string, projectId: string, path: string): Promise<void>;
  createFolder(ownerId: string, projectId: string, request: FolderCreateRequest | null): Promise<FileOperationResponse>;
  renameFolder(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse>;
  deleteFolder(ownerId: string, projectId: string, path: string): Promise<void>;
  sources(ownerId: string, projectId: string): Promise<Map<string, string>>;
}
