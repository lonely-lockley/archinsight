import type { Cookies } from '@sveltejs/kit';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { requireCapability } from '$lib/server/auth/authorization';
import { authenticateRequired } from '$lib/server/auth/request-auth';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { forbidden } from '$lib/server/errors/application-error';

const slot = 'default';

export async function currentPlaygroundPublication(services: ApplicationServices) {
  return services.publicationStore.current(slot);
}

export async function managePlaygroundPublication(cookies: Cookies, services: ApplicationServices) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  const user = await authenticateRequired(cookies, services);
  requireCapability(user, 'publication:manage');
  return currentPlaygroundPublication(services);
}

export async function publishProject(cookies: Cookies, services: ApplicationServices, projectId: string) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  const user = await authenticateRequired(cookies, services);
  requireCapability(user, 'publication:manage');
  const owned = (await services.repository.projects(user.id)).some((project) => project.id === projectId);
  if (!owned) {
    throw forbidden('Project is not owned by the current user');
  }
  return services.publicationStore.publish(slot, user.id, projectId, user.id);
}

export async function unpublishProject(cookies: Cookies, services: ApplicationServices): Promise<void> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  const user = await authenticateRequired(cookies, services);
  requireCapability(user, 'publication:manage');
  const current = await currentPlaygroundPublication(services);
  if (current && current.ownerId !== user.id) {
    throw forbidden('Published project is not owned by the current user');
  }
  await services.publicationStore.unpublish(slot);
}
