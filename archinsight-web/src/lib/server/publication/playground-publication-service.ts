import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { requireCapability } from '$lib/server/auth/authorization';
import { authenticateRequired } from '$lib/server/auth/request-auth';
import { repositoryFileSystem } from '$lib/server/repository/repository-file-system';
import { playgroundPublicationStore } from './playground-publication-store';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { forbidden } from '$lib/server/errors/application-error';

const slot = 'default';

export async function currentPlaygroundPublication(env: EnvSource | undefined) {
  return playgroundPublicationStore(env).current(slot);
}

export async function managePlaygroundPublication(cookies: Cookies, env: EnvSource | undefined) {
  requireRuntimeProfile(env, 'editor');
  const user = await authenticateRequired(cookies, env);
  requireCapability(user, 'publication:manage');
  return currentPlaygroundPublication(env);
}

export async function publishProject(cookies: Cookies, env: EnvSource | undefined, projectId: string) {
  requireRuntimeProfile(env, 'editor');
  const user = await authenticateRequired(cookies, env);
  requireCapability(user, 'publication:manage');
  const owned = (await repositoryFileSystem(env).projects(user.id)).some((project) => project.id === projectId);
  if (!owned) {
    throw forbidden('Project is not owned by the current user');
  }
  return playgroundPublicationStore(env).publish(slot, user.id, projectId, user.id);
}

export async function unpublishProject(cookies: Cookies, env: EnvSource | undefined): Promise<void> {
  requireRuntimeProfile(env, 'editor');
  const user = await authenticateRequired(cookies, env);
  requireCapability(user, 'publication:manage');
  const current = await currentPlaygroundPublication(env);
  if (current && current.ownerId !== user.id) {
    throw forbidden('Published project is not owned by the current user');
  }
  await playgroundPublicationStore(env).unpublish(slot);
}
