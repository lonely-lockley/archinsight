import type {
  BuiltinDiagramView,
  GraphNode,
  GraphRelation,
  LanguageSnapshot,
  LinkProjectResult,
  ProjectStructure as LanguageProjectStructure,
  ProjectStructureDeclaration
} from '@insight/language';
import { base } from '$app/paths';

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

export type FileOperationResponse = {
  path: string;
  revision: string;
};

export type FileSaveRequest = {
  content: string;
  level?: string;
  projectIdentifier?: string;
};

export type FolderCreateRequest = {
  path: string;
};

export type Diagnostic = {
  source: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  level: 'ERROR' | 'WARNING' | string;
  code: string;
  message: string;
  category?: 'SOURCE' | 'SYSTEM' | string;
};

export type DotRender = {
  sourceIdentity: string;
  diagram: string;
  dot: string;
};

export type LinkResponse = {
  revision: string;
  analysis: {
    mode: 'full' | 'cache-hit' | 'incremental' | 'overlay-incremental' | 'overlay-full';
    relinkedSources: number;
  };
  symbols: ProjectSymbols;
  linkedModel: Omit<LinkProjectResult, 'graph'> & {
    graph: {
      nodes: readonly GraphNode[];
      relations: readonly GraphRelation[];
    };
  };
  diagnostics: Diagnostic[];
  renders: DotRender[];
  structure: ProjectStructure;
};

export type ProjectSymbols = LanguageSnapshot;

export type ProjectSummaryResponse = {
  id: string;
  name: string;
  created: string;
  updated: string;
  fileCount: number;
};

export type ProjectListResponse = {
  projects: ProjectSummaryResponse[];
};

export type StructureDeclaration = ProjectStructureDeclaration;

export type ProjectStructure = LanguageProjectStructure;

export type SvgRender = {
  sourceIdentity: string;
  diagram: string;
  svg: string;
};

export type SvgRenderResponse = {
  diagnostics: Diagnostic[];
  svgs: SvgRender[];
};

export type AuthLoginOption = {
  id: string;
  label: string;
  url: string;
};

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

export type AppRole = 'user' | 'playground_admin';
export type AppCapability = 'repository:read-own' | 'repository:write-own' | 'publication:manage';
export type WorkspaceSurface = 'editor' | 'playground';

export type PlaygroundPublication = {
  slot: string;
  repositoryId: string;
  ownerId: string;
  publishedBy: string;
  publishedAt: string;
  updatedAt: string;
};

const API_BASE = import.meta.env.VITE_INSIGHT_API_BASE ?? base;

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export function routePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export async function fetchProjects(surface: WorkspaceSurface = 'editor'): Promise<ProjectListResponse> {
  return getJson(surface === 'playground' ? '/api/playground' : '/api/projects');
}

export async function createProject(name: string): Promise<ProjectSummaryResponse> {
  return postJson('/api/projects', { name });
}

export async function updateProject(projectId: string, name: string): Promise<ProjectSummaryResponse> {
  return requestJson('PATCH', `/api/projects/${encodeURIComponent(projectId)}`, { name });
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(await responseErrorMessage(response));
}

export async function fetchTree(projectId: string, surface: WorkspaceSurface = 'editor'): Promise<FileTreeResponse> {
  return getJson(surface === 'playground' ? '/api/playground/files' : `/api/projects/${encodeURIComponent(projectId)}/files`);
}

export async function fetchFile(projectId: string, path: string, surface: WorkspaceSurface = 'editor'): Promise<FileContentResponse> {
  return getJson(
    surface === 'playground'
      ? `/api/playground/files/content?path=${encodeURIComponent(path)}`
      : `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`
  );
}

export async function saveFile(projectId: string, path: string, request: FileSaveRequest): Promise<FileOperationResponse> {
  return requestJson(
    'PUT',
    `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    request
  );
}

export async function renameFile(projectId: string, sourcePath: string, targetPath: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/files/rename`, { sourcePath, targetPath });
}

export async function createFolder(projectId: string, path: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/folders`, { path });
}

export async function renameFolder(projectId: string, sourcePath: string, targetPath: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/folders/rename`, { sourcePath, targetPath });
}

export async function deleteFile(projectId: string, path: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    { method: 'DELETE', credentials: 'include' }
  );
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

export async function deleteFolder(projectId: string, path: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/folders?path=${encodeURIComponent(path)}`,
    { method: 'DELETE', credentials: 'include' }
  );
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

export async function fetchProjectSymbols(projectId: string, surface: WorkspaceSurface = 'editor'): Promise<ProjectSymbols> {
  const path = surface === 'playground' ? '/api/playground/symbols' : `/api/projects/${encodeURIComponent(projectId)}/symbols`;
  return normalizeProjectSymbols(await getJson<ProjectSymbols>(path));
}

export async function fetchProjectStructure(
  projectId: string,
  overlays: Record<string, string> = {},
  surface: WorkspaceSurface = 'editor'
): Promise<ProjectStructure> {
  return postJson(surface === 'playground' ? '/api/playground/structure' : `/api/projects/${encodeURIComponent(projectId)}/structure`, { overlays });
}

export async function linkProject(
  projectId: string,
  openSourceIdentities: string[],
  overlays: Record<string, string>,
  query: string,
  view: BuiltinDiagramView,
  environment: string | undefined,
  surface: WorkspaceSurface = 'editor'
): Promise<LinkResponse> {
  return postJson(surface === 'playground' ? '/api/playground/link' : `/api/projects/${encodeURIComponent(projectId)}/link`, {
    openSourceIdentities,
    overlays,
    query,
    view,
    environment
  });
}

export async function renderProjectSvg(
  projectId: string,
  renders: DotRender[],
  surface: WorkspaceSurface = 'editor'
): Promise<SvgRenderResponse> {
  return postJson(surface === 'playground' ? '/api/playground/render/svg' : `/api/projects/${encodeURIComponent(projectId)}/render/svg`, {
    renders
  });
}

export async function fetchPlaygroundPublication(): Promise<PlaygroundPublication | null> {
  return getJson('/api/admin/playground/publication');
}

export async function publishToPlayground(projectId: string): Promise<PlaygroundPublication> {
  return requestJson('PUT', '/api/admin/playground/publication', { projectId });
}

export async function unpublishFromPlayground(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/playground/publication`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

export async function fetchCurrentUser(): Promise<AuthUserResponse> {
  return getJson('/api/auth/me');
}

export async function logoutCurrentUser(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson('POST', path, body);
}

async function requestJson<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

async function responseErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const body = await response.text();
  if (body.trim().length === 0) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    const message = parsed.error ?? parsed.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return firstMessageLine(message);
    }
  } catch {
    // Fall back to plain-text response handling below.
  }
  return firstMessageLine(body) || fallback;
}

function firstMessageLine(message: string): string {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('at ')) ?? '';
}

function normalizeProjectSymbols(symbols: ProjectSymbols): ProjectSymbols {
  return {
    schemaVersion: symbols.schemaVersion,
    types: symbols.types.map((type) => ({
      name: type.name,
      ...(type.baseType == null ? {} : { baseType: type.baseType }),
      ...(type.attributes == null || type.attributes.length === 0 ? {} : {
        attributes: type.attributes.map((attribute) => ({
          name: attribute.name,
          type: attribute.type,
          ...(attribute.listElementType == null ? {} : { listElementType: attribute.listElementType }),
          ...(attribute.required == null ? {} : { required: attribute.required }),
          ...(attribute.list == null ? {} : { list: attribute.list })
        }))
      })
    })),
    constructors: symbols.constructors,
    operators: symbols.operators.map((operator) => ({
      spelling: operator.spelling,
      ownerType: operator.ownerType,
      ...(operator.leftType == null ? {} : { leftType: operator.leftType }),
      targetType: operator.targetType
    })),
    enums: symbols.enums
  };
}
