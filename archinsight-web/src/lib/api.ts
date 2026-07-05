import type { LanguageSnapshot } from '@insight/language';
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
  diagnostics: Diagnostic[];
  renders: DotRender[];
  structure?: ProjectStructure;
};

export type ProjectSymbols = LanguageSnapshot;

export type ProjectSummaryResponse = {
  id: string;
  name: string;
};

export type ProjectListResponse = {
  projects: ProjectSummaryResponse[];
};

export type StructureDeclaration = {
  id: string;
  kind: 'context' | 'element' | 'import' | string;
  constructor: string;
  type?: string;
  source: string;
  line: number;
  column: number;
  children: StructureDeclaration[];
};

export type ProjectStructure = {
  schemaVersion: string;
  contexts: StructureDeclaration[];
};

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

export async function fetchProjects(): Promise<ProjectListResponse> {
  return getJson('/api/projects');
}

export async function fetchTree(projectId: string): Promise<FileTreeResponse> {
  return getJson(`/api/projects/${encodeURIComponent(projectId)}/files`);
}

export async function fetchFile(projectId: string, path: string): Promise<FileContentResponse> {
  return getJson(
    `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`
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

export async function fetchProjectSymbols(projectId: string): Promise<ProjectSymbols> {
  return normalizeProjectSymbols(await getJson<ProjectSymbols>(`/api/projects/${encodeURIComponent(projectId)}/symbols`));
}

export async function fetchProjectStructure(
  projectId: string,
  overlays: Record<string, string> = {}
): Promise<ProjectStructure> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/structure`, { overlays });
}

export async function linkProject(
  projectId: string,
  openSourceIdentities: string[],
  overlays: Record<string, string>,
  query: string
): Promise<LinkResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/link`, { openSourceIdentities, overlays, query });
}

export async function renderProjectSvg(
  projectId: string,
  openSourceIdentities: string[],
  overlays: Record<string, string>,
  query: string
): Promise<SvgRenderResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/render/svg`, {
    openSourceIdentities,
    overlays,
    query
  });
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

async function requestJson<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
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
