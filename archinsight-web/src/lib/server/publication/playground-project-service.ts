import type { EnvSource } from '$lib/server/auth/auth-config';
import {
  linkForStoredSources,
  structureForStoredSources,
  symbolsForStoredSources
} from '$lib/server/language/language-pipeline';
import type { LinkRequest, ProjectStructureRequest } from '$lib/server/language/types';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { playgroundProjectStore } from './playground-project-store';

export async function playgroundProjects(env: EnvSource | undefined) {
  const project = await publishedProject(env);
  return { projects: [await project.project()] };
}

export async function playgroundTree(env: EnvSource | undefined) {
  return (await publishedProject(env)).tree();
}

export async function playgroundRead(env: EnvSource | undefined, path: string) {
  return (await publishedProject(env)).read(path);
}

export async function playgroundSymbols(env: EnvSource | undefined) {
  const { cacheKey, sources } = await analysisSources(env);
  return symbolsForStoredSources(env, cacheKey, sources);
}

export async function playgroundStructure(env: EnvSource | undefined, request: ProjectStructureRequest | null) {
  const { cacheKey, sources } = await analysisSources(env);
  return structureForStoredSources(env, cacheKey, sources, request);
}

export async function playgroundLink(env: EnvSource | undefined, request: LinkRequest | null) {
  const { cacheKey, sources } = await analysisSources(env);
  return linkForStoredSources(env, cacheKey, sources, request);
}

async function analysisSources(env: EnvSource | undefined) {
  const project = await publishedProject(env);
  const summary = await project.project();
  return {
    cacheKey: `playground:${summary.id}`,
    sources: await project.sources()
  };
}

async function publishedProject(env: EnvSource | undefined) {
  requireRuntimeProfile(env, 'playground');
  return playgroundProjectStore(env);
}
