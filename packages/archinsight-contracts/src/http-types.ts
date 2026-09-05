import type {
  BuiltinDiagramView,
  GraphNode,
  GraphRelation,
  LanguageSnapshot,
  LinkProjectResult,
  ProjectStructure
} from '@insight/language';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export type ApiErrorResponse = {
  error: string;
  code?: ApiErrorCode;
  correlationId?: string;
};

export type ProjectSummaryResponse = {
  id: string;
  name: string;
  created: string;
  updated: string;
  fileCount: number;
};

export type ProjectListResponse = { projects: ProjectSummaryResponse[] };
export type PlaygroundProjectSummaryResponse = { id: string; name: string };
export type PlaygroundProjectListResponse = { projects: PlaygroundProjectSummaryResponse[] };
export type ProjectCreateRequest = { name?: string | null };
export type ProjectUpdateRequest = { name?: string | null };

export type FileTreeNode = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children: FileTreeNode[];
};

export type FileTreeResponse = { root: FileTreeNode };
export type FileContentResponse = {
  path: string;
  content: string;
  readOnly: boolean;
  revision: string;
};
export type FileOperationResponse = { path: string; revision: string };
export type FileSaveRequest = { content?: string | null; level?: string | null; projectIdentifier?: string | null };
export type FileRenameRequest = { sourcePath?: string | null; targetPath?: string | null };
export type FolderCreateRequest = { path?: string | null };

export type DiagnosticDto = {
  source: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  level: 'ERROR' | 'WARNING' | 'NOTE' | string;
  code: string;
  message: string;
  category?: 'SOURCE' | 'SYSTEM' | string;
};

export type DotRenderDto = { sourceIdentity: string; diagram: string; dot: string };
export type SvgRenderDto = { sourceIdentity: string; diagram: string; svg: string };
export type SvgRenderRequest = { renders?: DotRenderDto[] | null };
export type SvgRenderResponse = { diagnostics: DiagnosticDto[]; svgs: SvgRenderDto[] };

export type LinkRequest = {
  openSourceIdentities?: string[] | null;
  overlays?: Record<string, string> | null;
  query?: string | null;
  view?: BuiltinDiagramView | null;
  environment?: string | null;
  forceFullAnalysis?: boolean;
};

export type ProjectStructureRequest = { overlays?: Record<string, string> | null };
export type ProjectStructureResponse = ProjectStructure;

export type LinkResponse = {
  revision: string;
  analysis: {
    mode: 'full' | 'cache-hit' | 'incremental' | 'overlay-incremental' | 'overlay-full';
    relinkedSources: number;
  };
  symbols: LanguageSnapshot;
  linkedModel: Omit<LinkProjectResult, 'graph'> & {
    graph: { nodes: readonly GraphNode[]; relations: readonly GraphRelation[] };
  };
  diagnostics: DiagnosticDto[];
  renders: DotRenderDto[];
  structure: ProjectStructureResponse;
};

export type AuthLoginOption = { id: string; label: string; url: string };
export type AppRole = 'user' | 'playground_admin';
export type AppCapability = 'repository:read-own' | 'repository:write-own' | 'publication:manage';
export type AuthUserResponse = {
  authenticated: boolean;
  id?: string | null;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  loginUrl?: string | null;
  logoutUrl?: string | null;
  loginOptions?: AuthLoginOption[] | null;
  roles?: AppRole[];
  capabilities?: AppCapability[];
};

export type PlaygroundPublication = {
  slot: string;
  repositoryId: string;
  ownerId: string;
  publishedBy: string;
  publishedAt: string;
  updatedAt: string;
};

export type PublishPlaygroundRequest = { projectId?: string | null };
