import {
  coreLanguageSnapshot,
  InsightLanguageService,
  type LanguageBuildResult,
  type LanguageDiagnostic,
  type LinkedElement,
  type LinkedImport,
  type LinkProjectResult,
  type ProjectSource
} from '@insight/language';
import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { sourcesForProjectWithOverlays, sourcesWithOverlays } from '$lib/server/repository/project-file-service';
import { requestLimits, validateOverlays, validateQuery } from '$lib/server/security/request-limits';
import { normalizeSourceIdentity } from '$lib/server/repository/path';
import type {
  DiagnosticDto,
  LinkRequest,
  LinkResponse,
  ProjectStructureRequest,
  ProjectStructureResponse,
  StructureDeclarationDto
} from './types';

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });

export async function symbols(cookies: Cookies, env: EnvSource | undefined, projectId: string) {
  const sources = await projectSources(cookies, env, projectId, {});
  return symbolsFromSources(sources);
}

export async function symbolsForProject(env: EnvSource | undefined, ownerId: string, projectId: string) {
  const sources = await referencedProjectSources(env, ownerId, projectId, {});
  return symbolsFromSources(sources);
}

export function symbolsForSources(sources: ReadonlyMap<string, string>) {
  return symbolsFromSources(projectSourceList(sources));
}

function symbolsFromSources(sources: ProjectSource[]) {
  const projectSnapshot = buildProjectSnapshot(sources).snapshot;
  return projectSnapshot;
}

export async function structure(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, env);
  const sources = await projectSources(cookies, env, projectId, request?.overlays ?? {});
  return structureFromSources(sources);
}

export async function structureForProject(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, env);
  return structureFromSources(await referencedProjectSources(env, ownerId, projectId, request?.overlays ?? {}));
}

export function structureForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: ProjectStructureRequest | null
): ProjectStructureResponse {
  validateRequest(request, env);
  return structureFromSources(projectSourceList(withOverlays(sources, request?.overlays)));
}

function structureFromSources(sources: ProjectSource[]): ProjectStructureResponse {
  const projectSnapshot = buildProjectSnapshot(sources);
  const result = service.link({
    sources,
    snapshot: projectSnapshot.snapshot
  });
  return projectStructure(withSnapshotDiagnostics(result, projectSnapshot));
}

export async function link(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, env);
  const sources = await projectSources(cookies, env, projectId, request?.overlays ?? {});
  return linkFromSources(sources, request);
}

export async function linkForProject(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, env);
  return linkFromSources(await referencedProjectSources(env, ownerId, projectId, request?.overlays ?? {}), request);
}

export function linkForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: LinkRequest | null
): LinkResponse {
  validateRequest(request, env);
  return linkFromSources(projectSourceList(withOverlays(sources, request?.overlays)), request);
}

function linkFromSources(sources: ProjectSource[], request: LinkRequest | null): LinkResponse {
  const projectSnapshot = buildProjectSnapshot(sources);
  const result = service.link({ sources, snapshot: projectSnapshot.snapshot });
  const resultWithSnapshotDiagnostics = withSnapshotDiagnostics(result, projectSnapshot);
  const diagnostics = resultWithSnapshotDiagnostics.diagnostics.map(diagnostic);
  const renders = renderPaths(request, resultWithSnapshotDiagnostics).flatMap((sourceIdentity) => {
    const context = resultWithSnapshotDiagnostics.contexts.find((candidate) => candidate.sourceIdentity === sourceIdentity);
    try {
      return [
        {
          sourceIdentity,
          diagram: 'query',
          dot: service.render({
            result: resultWithSnapshotDiagnostics,
            scope: { context: context?.id, tab: sourceIdentity },
            query: request?.query ?? undefined,
            theme: 'dark'
          }).dot
        }
      ];
    } catch (error) {
      diagnostics.push(systemDiagnostic(error));
      return [];
    }
  });

  return {
    diagnostics,
    renders,
    structure: projectStructure(resultWithSnapshotDiagnostics)
  };
}

function buildProjectSnapshot(sources: readonly ProjectSource[]): LanguageBuildResult {
  return service.buildSnapshot(
    sources.map((source) => ({ sourceName: source.sourceName, source: source.source })),
    [coreLanguageSnapshot]
  );
}

function withSnapshotDiagnostics(result: LinkProjectResult, projectSnapshot: LanguageBuildResult): LinkProjectResult {
  return {
    ...result,
    diagnostics: [...projectSnapshot.diagnostics, ...result.diagnostics]
  };
}

function validateRequest(request: LinkRequest | ProjectStructureRequest | null, env: EnvSource | undefined): void {
  validateQuery('query' in (request ?? {}) ? (request as LinkRequest).query : null, requestLimits(env));
  validateOverlays(request?.overlays, requestLimits(env));
}

async function projectSources(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<ProjectSource[]> {
  return [...(await sourcesWithOverlays(cookies, env, projectId, overlays)).entries()].map(([sourceName, source]) => ({
    sourceName,
    source
  }));
}

async function referencedProjectSources(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  overlays: Record<string, string> | null | undefined
): Promise<ProjectSource[]> {
  return [...(await sourcesForProjectWithOverlays(env, ownerId, projectId, overlays)).entries()].map(([sourceName, source]) => ({
    sourceName,
    source
  }));
}

function withOverlays(
  sources: ReadonlyMap<string, string>,
  overlays: Record<string, string> | null | undefined
): Map<string, string> {
  const result = new Map(sources);
  for (const [sourceName, source] of Object.entries(overlays ?? {})) {
    result.set(normalizeSourceIdentity(sourceName), source);
  }
  return result;
}

function projectSourceList(sources: ReadonlyMap<string, string>): ProjectSource[] {
  return [...sources.entries()].map(([sourceName, source]) => ({ sourceName, source }));
}

function renderPaths(request: LinkRequest | null, result: LinkProjectResult): string[] {
  const requested = request?.openSourceIdentities?.filter((sourceIdentity) => sourceIdentity.trim() !== '') ?? [];
  if (requested.length > 0) {
    return [...new Set(requested)];
  }
  return result.contexts.map((context) => context.sourceIdentity);
}

function projectStructure(result: LinkProjectResult): ProjectStructureResponse {
  const childrenByParent = new Map<string, LinkedElement[]>();
  for (const element of result.elements) {
    if (element.anonymous) {
      continue;
    }
    if (!element.parent) {
      continue;
    }
    const children = childrenByParent.get(element.parent) ?? [];
    children.push(element);
    childrenByParent.set(element.parent, children);
  }
  const importsBySource = new Map<string, LinkedImport[]>();
  for (const item of result.imports) {
    const imports = importsBySource.get(item.sourceIdentity) ?? [];
    imports.push(item);
    importsBySource.set(item.sourceIdentity, imports);
  }
  const elementsById = new Map(result.elements.map((element) => [element.id, element]));

  return {
    schemaVersion: 'project-structure.v1',
    contexts: result.contexts.map((context) => ({
      id: context.id,
      kind: 'context',
      constructor: context.type,
      type: context.type,
      source: context.declaration?.sourceName ?? context.sourceIdentity,
      line: context.declaration?.line ?? 1,
      column: context.declaration?.column ?? 1,
      children: [
        ...(importsBySource.get(context.sourceIdentity) ?? []).map((item) => importDeclaration(item, elementsById)),
        ...children(
          result.elements.filter((element) => element.context === context.id && element.parent == null && !element.anonymous),
          childrenByParent
        )
      ]
    }))
  };
}

function children(elements: LinkedElement[], childrenByParent: Map<string, LinkedElement[]>): StructureDeclarationDto[] {
  return elements.map((element) => ({
    id: element.localId,
    kind: 'element',
    constructor: element.constructor,
    type: element.type,
    source: element.declaration?.sourceName ?? element.sourceIdentity,
    line: element.declaration?.line ?? 1,
    column: element.declaration?.column ?? 1,
    children: children(childrenByParent.get(element.id) ?? [], childrenByParent)
  }));
}

function importDeclaration(
  item: LinkedImport,
  elementsById: ReadonlyMap<string, LinkedElement>
): StructureDeclarationDto {
  const imported = elementsById.get(item.target);
  return {
    id: item.alias,
    kind: 'import',
    constructor: 'import',
    ...(imported?.type === undefined ? {} : { type: imported.type }),
    source: item.declaration?.sourceName ?? item.sourceIdentity,
    line: item.declaration?.line ?? 1,
    column: item.declaration?.column ?? 1,
    children: []
  };
}

function diagnostic(item: LanguageDiagnostic): DiagnosticDto {
  return {
    source: item.sourceName,
    line: item.line,
    column: Math.max(0, item.column - 1),
    ...(item.endLine === undefined ? {} : { endLine: item.endLine }),
    ...(item.endColumn === undefined ? {} : { endColumn: Math.max(0, item.endColumn - 1) }),
    level: item.level ?? 'ERROR',
    code: item.code,
    message: item.message,
    category: 'SOURCE'
  };
}

function systemDiagnostic(error: unknown): DiagnosticDto {
  return {
    source: '-',
    level: 'ERROR',
    code: 'RENDER_FAILED',
    message: error instanceof Error ? error.message : 'Render failed',
    category: 'SYSTEM'
  };
}
