import type {
  BuiltinDiagramView,
  LanguageSnapshot,
  ProjectStructureDeclaration
} from '@insight/language';
import { base } from '$app/paths';
import {
  parseApiErrorResponse,
  parseAuthUserResponse,
  parseFileContentResponse,
  parseFileOperationResponse,
  parseFileTreeResponse,
  parseLanguageSnapshotResponse,
  parseLinkResponse,
  parseNullablePlaygroundPublication,
  parsePlaygroundPublication,
  parseProjectListResponse,
  parseProjectStructureResponse,
  parseProjectSummary,
  parseSvgRenderResponse,
  type AppCapability as SharedAppCapability,
  type AppRole as SharedAppRole,
  type AuthLoginOption as SharedAuthLoginOption,
  type AuthUserResponse as SharedAuthUserResponse,
  type DiagnosticDto,
  type DotRenderDto,
  type FileContentResponse as SharedFileContentResponse,
  type FileOperationResponse as SharedFileOperationResponse,
  type FileSaveRequest as SharedFileSaveRequest,
  type FileTreeNode as SharedFileTreeNode,
  type FileTreeResponse as SharedFileTreeResponse,
  type LinkResponse as SharedLinkResponse,
  type PlaygroundPublication as SharedPlaygroundPublication,
  type ProjectListResponse as SharedProjectListResponse,
  type ProjectStructureResponse,
  type ProjectSummaryResponse as SharedProjectSummaryResponse,
  type SvgRenderDto,
  type SvgRenderResponse as SharedSvgRenderResponse
} from '@archinsight/contracts';

export type FileTreeNode = SharedFileTreeNode;
export type FileTreeResponse = SharedFileTreeResponse;
export type FileContentResponse = SharedFileContentResponse;
export type FileOperationResponse = SharedFileOperationResponse;
export type FileSaveRequest = SharedFileSaveRequest & { content: string };

export type FolderCreateRequest = {
  path: string;
};

export type Diagnostic = DiagnosticDto;
export type DotRender = DotRenderDto;
export type LinkResponse = SharedLinkResponse;

export type ProjectSymbols = LanguageSnapshot;

export type ProjectSummaryResponse = SharedProjectSummaryResponse;
export type ProjectListResponse = SharedProjectListResponse;

export type StructureDeclaration = ProjectStructureDeclaration;

export type ProjectStructure = ProjectStructureResponse;
export type SvgRender = SvgRenderDto;
export type SvgRenderResponse = SharedSvgRenderResponse;
export type AuthLoginOption = SharedAuthLoginOption;
export type AuthUserResponse = SharedAuthUserResponse;
export type AppRole = SharedAppRole;
export type AppCapability = SharedAppCapability;
export type WorkspaceSurface = 'editor' | 'playground';

export type PlaygroundPublication = SharedPlaygroundPublication;

const API_BASE = import.meta.env.VITE_INSIGHT_API_BASE ?? base;

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export class ApiError extends Error {
  readonly name = 'ApiError';

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly correlationId?: string
  ) {
    super(message);
  }
}

export function routePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export async function fetchProjects(surface: WorkspaceSurface = 'editor'): Promise<ProjectListResponse> {
  return getJson(surface === 'playground' ? '/api/playground' : '/api/projects', parseProjectListResponse);
}

export async function createProject(name: string): Promise<ProjectSummaryResponse> {
  return postJson('/api/projects', { name }, parseProjectSummary);
}

export async function updateProject(projectId: string, name: string): Promise<ProjectSummaryResponse> {
  return requestJson('PATCH', `/api/projects/${encodeURIComponent(projectId)}`, { name }, parseProjectSummary);
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw await responseError(response);
}

export async function fetchTree(projectId: string, surface: WorkspaceSurface = 'editor'): Promise<FileTreeResponse> {
  return getJson(
    surface === 'playground' ? '/api/playground/files' : `/api/projects/${encodeURIComponent(projectId)}/files`,
    parseFileTreeResponse
  );
}

export async function fetchFile(projectId: string, path: string, surface: WorkspaceSurface = 'editor'): Promise<FileContentResponse> {
  return getJson(
    surface === 'playground'
      ? `/api/playground/files/content?path=${encodeURIComponent(path)}`
      : `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    parseFileContentResponse
  );
}

export async function saveFile(projectId: string, path: string, request: FileSaveRequest): Promise<FileOperationResponse> {
  return requestJson(
    'PUT',
    `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}`,
    request,
    parseFileOperationResponse
  );
}

export async function renameFile(projectId: string, sourcePath: string, targetPath: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/files/rename`, { sourcePath, targetPath }, parseFileOperationResponse);
}

export async function createFolder(projectId: string, path: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/folders`, { path }, parseFileOperationResponse);
}

export async function renameFolder(projectId: string, sourcePath: string, targetPath: string): Promise<FileOperationResponse> {
  return postJson(`/api/projects/${encodeURIComponent(projectId)}/folders/rename`, { sourcePath, targetPath }, parseFileOperationResponse);
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
    throw await responseError(response);
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
    throw await responseError(response);
  }
}

export async function fetchProjectSymbols(projectId: string, surface: WorkspaceSurface = 'editor'): Promise<ProjectSymbols> {
  const path = surface === 'playground' ? '/api/playground/symbols' : `/api/projects/${encodeURIComponent(projectId)}/symbols`;
  return normalizeProjectSymbols(await getJson(path, parseLanguageSnapshotResponse));
}

export async function fetchProjectStructure(
  projectId: string,
  overlays: Record<string, string> = {},
  surface: WorkspaceSurface = 'editor'
): Promise<ProjectStructure> {
  return postJson(
    surface === 'playground' ? '/api/playground/structure' : `/api/projects/${encodeURIComponent(projectId)}/structure`,
    { overlays },
    parseProjectStructureResponse
  );
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
  return postJson(
    surface === 'playground' ? '/api/playground/link' : `/api/projects/${encodeURIComponent(projectId)}/link`,
    { openSourceIdentities, overlays, query, view, environment },
    parseLinkResponse
  );
}

export async function renderProjectSvg(
  projectId: string,
  renders: DotRender[],
  surface: WorkspaceSurface = 'editor'
): Promise<SvgRenderResponse> {
  return postJson(
    surface === 'playground' ? '/api/playground/render/svg' : `/api/projects/${encodeURIComponent(projectId)}/render/svg`,
    { renders },
    parseSvgRenderResponse
  );
}

export async function fetchPlaygroundPublication(): Promise<PlaygroundPublication | null> {
  return getJson('/api/admin/playground/publication', parseNullablePlaygroundPublication);
}

export async function publishToPlayground(projectId: string): Promise<PlaygroundPublication> {
  return requestJson('PUT', '/api/admin/playground/publication', { projectId }, parsePlaygroundPublication);
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
    throw await responseError(response);
  }
}

export async function fetchCurrentUser(): Promise<AuthUserResponse> {
  return getJson('/api/auth/me', parseAuthUserResponse);
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
    throw await responseError(response);
  }
}

async function getJson<T>(path: string, parser: (value: unknown) => T): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  return parser(await response.json());
}

async function postJson<T>(path: string, body: unknown, parser: (value: unknown) => T): Promise<T> {
  return requestJson('POST', path, body, parser);
}

async function requestJson<T>(
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body: unknown,
  parser: (value: unknown) => T
): Promise<T> {
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
    throw await responseError(response);
  }
  return parser(await response.json());
}

async function responseError(response: Response): Promise<ApiError> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const body = await response.text();
  if (body.trim().length === 0) {
    return new ApiError(fallback, response.status);
  }
  try {
    const raw = JSON.parse(body) as unknown;
    const parsed = parseApiErrorResponse(raw);
    if (parsed.error.trim().length > 0) {
      return new ApiError(
        firstMessageLine(parsed.error),
        response.status,
        parsed.code,
        parsed.correlationId
      );
    }
  } catch {
    // Fall back to plain-text response handling below.
  }
  return new ApiError(firstMessageLine(body) || fallback, response.status);
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
