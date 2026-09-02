import type {
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeNode,
  FileTreeResponse,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectListResponse,
  ProjectSummaryResponse,
  ProjectUpdateRequest
} from '@archinsight/contracts';

export type {
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeNode,
  FileTreeResponse,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectListResponse,
  ProjectSummaryResponse,
  ProjectUpdateRequest
} from '@archinsight/contracts';

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
  createProject(ownerId: string, request: ProjectCreateRequest | null): Promise<ProjectSummaryResponse>;
  updateProject(ownerId: string, projectId: string, request: ProjectUpdateRequest | null): Promise<ProjectSummaryResponse>;
  deleteProject(ownerId: string, projectId: string): Promise<void>;
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
