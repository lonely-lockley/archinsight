import type { ApplicationServices } from '$lib/server/config/application-services';
import {
  linkForStoredSources,
  structureForStoredSources,
  symbolsForStoredSources
} from '$lib/server/language/language-pipeline';
import type { LinkRequest, ProjectStructureRequest } from '$lib/server/language/types';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { playgroundProjectStore } from './playground-project-store';

export async function playgroundProjects(services: ApplicationServices) {
  const project = await publishedProject(services);
  return { projects: [await project.project()] };
}

export async function playgroundTree(services: ApplicationServices) {
  return (await publishedProject(services)).tree();
}

export async function playgroundRead(services: ApplicationServices, path: string) {
  return (await publishedProject(services)).read(path);
}

export async function playgroundSymbols(services: ApplicationServices) {
  const { cacheKey, sources } = await analysisSources(services);
  return symbolsForStoredSources(services, cacheKey, sources);
}

export async function playgroundStructure(services: ApplicationServices, request: ProjectStructureRequest | null) {
  const { cacheKey, sources } = await analysisSources(services);
  return structureForStoredSources(services, cacheKey, sources, request);
}

export async function playgroundLink(services: ApplicationServices, request: LinkRequest | null) {
  const { cacheKey, sources } = await analysisSources(services);
  return linkForStoredSources(services, cacheKey, sources, request);
}

async function analysisSources(services: ApplicationServices) {
  const project = await publishedProject(services);
  const summary = await project.project();
  return {
    cacheKey: `playground:${summary.id}`,
    sources: await project.sources()
  };
}

async function publishedProject(services: ApplicationServices) {
  requireRuntimeProfile(services.config.runtimeProfile, 'playground');
  return playgroundProjectStore(services);
}
