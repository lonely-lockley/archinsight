import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { authenticateRequired } from '$lib/server/auth/request-auth';
import { requestLimits, validateFileContent, validateOverlays } from '$lib/server/security/request-limits';
import { normalizeSourceIdentity } from './path';
import { repositoryFileSystem } from './repository-file-system';
import type {
  FileRenameRequest,
  FileSaveRequest,
  FolderCreateRequest,
  ProjectListResponse
} from './types';

export async function projects(cookies: Cookies, env: EnvSource | undefined): Promise<ProjectListResponse> {
  const userId = await requireUserId(cookies, env);
  return { projects: await repositoryFileSystem(env).projects(userId) };
}

export async function tree(cookies: Cookies, env: EnvSource | undefined, projectId: string) {
  return repositoryFileSystem(env).tree(await requireUserId(cookies, env), projectId);
}

export async function read(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string) {
  return repositoryFileSystem(env).read(await requireUserId(cookies, env), projectId, path);
}

export async function save(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  path: string,
  request: FileSaveRequest | null
) {
  validateFileContent(request?.content, requestLimits(env));
  return repositoryFileSystem(env).save(await requireUserId(cookies, env), projectId, path, request);
}

export async function rename(cookies: Cookies, env: EnvSource | undefined, projectId: string, request: FileRenameRequest | null) {
  return repositoryFileSystem(env).rename(await requireUserId(cookies, env), projectId, request);
}

export async function deleteFile(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string): Promise<void> {
  return repositoryFileSystem(env).delete(await requireUserId(cookies, env), projectId, path);
}

export async function createFolder(cookies: Cookies, env: EnvSource | undefined, projectId: string, request: FolderCreateRequest | null) {
  return repositoryFileSystem(env).createFolder(await requireUserId(cookies, env), projectId, request);
}

export async function renameFolder(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: FileRenameRequest | null
) {
  return repositoryFileSystem(env).renameFolder(await requireUserId(cookies, env), projectId, request);
}

export async function deleteFolder(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string): Promise<void> {
  return repositoryFileSystem(env).deleteFolder(await requireUserId(cookies, env), projectId, path);
}

export async function sourcesWithOverlays(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<Map<string, string>> {
  validateOverlays(overlays, requestLimits(env));
  const userId = await requireUserId(cookies, env);
  const result = new Map(await repositoryFileSystem(env).sources(userId, projectId));
  for (const [sourceIdentity, content] of Object.entries(overlays ?? {})) {
    result.set(normalizeSourceIdentity(sourceIdentity), content);
  }
  return result;
}

export async function requireUserId(cookies: Cookies, env: EnvSource | undefined): Promise<string> {
  return (await authenticateRequired(cookies, env)).id;
}
