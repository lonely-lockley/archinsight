import type { EnvSource } from '$lib/server/auth/auth-config';
import { linkForSources, structureForSources, symbolsForSources } from '$lib/server/language/language-pipeline';
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
  return symbolsForSources(await (await publishedProject(env)).sources());
}

export async function playgroundStructure(env: EnvSource | undefined, request: ProjectStructureRequest | null) {
  return structureForSources(env, await (await publishedProject(env)).sources(), request);
}

export async function playgroundLink(env: EnvSource | undefined, request: LinkRequest | null) {
  return linkForSources(env, await (await publishedProject(env)).sources(), request);
}

async function publishedProject(env: EnvSource | undefined) {
  requireRuntimeProfile(env, 'playground');
  return playgroundProjectStore(env);
}
