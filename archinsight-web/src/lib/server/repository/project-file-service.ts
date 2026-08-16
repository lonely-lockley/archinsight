import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { authenticateRequired } from '$lib/server/auth/request-auth';
import { requireCapability } from '$lib/server/auth/authorization';
import type { AppCapability } from '$lib/server/auth/types';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
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
  requireRuntimeProfile(env, 'editor');
  const userId = await requireUserId(cookies, env, 'repository:read-own');
  return { projects: await repositoryFileSystem(env).projects(userId) };
}

export async function tree(cookies: Cookies, env: EnvSource | undefined, projectId: string) {
  requireRuntimeProfile(env, 'editor');
  return treeForProject(env, await requireUserId(cookies, env, 'repository:read-own'), projectId);
}

export async function read(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string) {
  requireRuntimeProfile(env, 'editor');
  return readForProject(env, await requireUserId(cookies, env, 'repository:read-own'), projectId, path);
}

export async function save(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  path: string,
  request: FileSaveRequest | null
) {
  requireRuntimeProfile(env, 'editor');
  validateFileContent(request?.content, requestLimits(env));
  return repositoryFileSystem(env).save(await requireUserId(cookies, env, 'repository:write-own'), projectId, path, request);
}

export async function rename(cookies: Cookies, env: EnvSource | undefined, projectId: string, request: FileRenameRequest | null) {
  requireRuntimeProfile(env, 'editor');
  return repositoryFileSystem(env).rename(await requireUserId(cookies, env, 'repository:write-own'), projectId, request);
}

export async function deleteFile(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string): Promise<void> {
  requireRuntimeProfile(env, 'editor');
  return repositoryFileSystem(env).delete(await requireUserId(cookies, env, 'repository:write-own'), projectId, path);
}

export async function createFolder(cookies: Cookies, env: EnvSource | undefined, projectId: string, request: FolderCreateRequest | null) {
  requireRuntimeProfile(env, 'editor');
  return repositoryFileSystem(env).createFolder(await requireUserId(cookies, env, 'repository:write-own'), projectId, request);
}

export async function renameFolder(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: FileRenameRequest | null
) {
  requireRuntimeProfile(env, 'editor');
  return repositoryFileSystem(env).renameFolder(await requireUserId(cookies, env, 'repository:write-own'), projectId, request);
}

export async function deleteFolder(cookies: Cookies, env: EnvSource | undefined, projectId: string, path: string): Promise<void> {
  requireRuntimeProfile(env, 'editor');
  return repositoryFileSystem(env).deleteFolder(await requireUserId(cookies, env, 'repository:write-own'), projectId, path);
}

export async function sourcesWithOverlays(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<Map<string, string>> {
  requireRuntimeProfile(env, 'editor');
  validateOverlays(overlays, requestLimits(env));
  const userId = await requireUserId(cookies, env, 'repository:read-own');
  return sourcesForProjectWithOverlays(env, userId, projectId, overlays);
}

export async function treeForProject(env: EnvSource | undefined, ownerId: string, projectId: string) {
  return repositoryFileSystem(env).tree(ownerId, projectId);
}

export async function readForProject(env: EnvSource | undefined, ownerId: string, projectId: string, path: string) {
  return repositoryFileSystem(env).read(ownerId, projectId, path);
}

export async function sourcesForProjectWithOverlays(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<Map<string, string>> {
  validateOverlays(overlays, requestLimits(env));
  const result = new Map(await repositoryFileSystem(env).sources(ownerId, projectId));
  for (const [sourceIdentity, content] of Object.entries(overlays ?? {})) {
    result.set(normalizeSourceIdentity(sourceIdentity), content);
  }
  return result;
}

export async function requireUserId(
  cookies: Cookies,
  env: EnvSource | undefined,
  capability: AppCapability = 'repository:read-own'
): Promise<string> {
  const user = await authenticateRequired(cookies, env);
  requireCapability(user, capability);
  return user.id;
}
