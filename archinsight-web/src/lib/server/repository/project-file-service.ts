import type { Cookies } from '@sveltejs/kit';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { authenticateRequired } from '$lib/server/auth/request-auth';
import { requireCapability } from '$lib/server/auth/authorization';
import type { AppCapability } from '$lib/server/auth/types';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { validateFileContent, validateOverlays } from '$lib/server/security/request-limits';
import { normalizeSourceIdentity } from './path';
import type {
  FileRenameRequest,
  FileSaveRequest,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ProjectListResponse
} from './types';

export async function projects(cookies: Cookies, services: ApplicationServices): Promise<ProjectListResponse> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  const userId = await requireUserId(cookies, services, 'repository:read-own');
  return { projects: await services.repository.projects(userId) };
}

export async function createProject(cookies: Cookies, services: ApplicationServices, request: ProjectCreateRequest | null) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.createProject(await requireUserId(cookies, services, 'repository:write-own'), request);
}

export async function updateProject(cookies: Cookies, services: ApplicationServices, projectId: string, request: ProjectUpdateRequest | null) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.updateProject(await requireUserId(cookies, services, 'repository:write-own'), projectId, request);
}

export async function deleteProject(cookies: Cookies, services: ApplicationServices, projectId: string): Promise<void> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.deleteProject(await requireUserId(cookies, services, 'repository:write-own'), projectId);
}

export async function tree(cookies: Cookies, services: ApplicationServices, projectId: string) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return treeForProject(services, await requireUserId(cookies, services, 'repository:read-own'), projectId);
}

export async function read(cookies: Cookies, services: ApplicationServices, projectId: string, path: string) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return readForProject(services, await requireUserId(cookies, services, 'repository:read-own'), projectId, path);
}

export async function save(
  cookies: Cookies,
  services: ApplicationServices,
  projectId: string,
  path: string,
  request: FileSaveRequest | null
) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  validateFileContent(request?.content, services.config.requestLimits);
  return services.repository.save(await requireUserId(cookies, services, 'repository:write-own'), projectId, path, request);
}

export async function rename(cookies: Cookies, services: ApplicationServices, projectId: string, request: FileRenameRequest | null) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.rename(await requireUserId(cookies, services, 'repository:write-own'), projectId, request);
}

export async function deleteFile(cookies: Cookies, services: ApplicationServices, projectId: string, path: string): Promise<void> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.delete(await requireUserId(cookies, services, 'repository:write-own'), projectId, path);
}

export async function createFolder(cookies: Cookies, services: ApplicationServices, projectId: string, request: FolderCreateRequest | null) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.createFolder(await requireUserId(cookies, services, 'repository:write-own'), projectId, request);
}

export async function renameFolder(
  cookies: Cookies,
  services: ApplicationServices,
  projectId: string,
  request: FileRenameRequest | null
) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.renameFolder(await requireUserId(cookies, services, 'repository:write-own'), projectId, request);
}

export async function deleteFolder(cookies: Cookies, services: ApplicationServices, projectId: string, path: string): Promise<void> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  return services.repository.deleteFolder(await requireUserId(cookies, services, 'repository:write-own'), projectId, path);
}

export async function sourcesWithOverlays(
  cookies: Cookies,
  services: ApplicationServices,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<Map<string, string>> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  validateOverlays(overlays, services.config.requestLimits);
  const userId = await requireUserId(cookies, services, 'repository:read-own');
  return sourcesForProjectWithOverlays(services, userId, projectId, overlays);
}

export async function treeForProject(services: ApplicationServices, ownerId: string, projectId: string) {
  return services.repository.tree(ownerId, projectId);
}

export async function readForProject(services: ApplicationServices, ownerId: string, projectId: string, path: string) {
  return services.repository.read(ownerId, projectId, path);
}

export async function sourcesForProjectWithOverlays(
  services: ApplicationServices,
  ownerId: string,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<Map<string, string>> {
  validateOverlays(overlays, services.config.requestLimits);
  const result = new Map(await services.repository.sources(ownerId, projectId));
  for (const [sourceIdentity, content] of Object.entries(overlays ?? {})) {
    result.set(normalizeSourceIdentity(sourceIdentity), content);
  }
  return result;
}

export async function requireUserId(
  cookies: Cookies,
  services: ApplicationServices,
  capability: AppCapability = 'repository:read-own'
): Promise<string> {
  const user = await authenticateRequired(cookies, services);
  requireCapability(user, capability);
  return user.id;
}
