import {
  buildProjectStructure,
  coreLanguageSnapshot,
  filterProjectStructure,
  InsightLanguageService,
  isBuiltinDiagramView,
  type LanguageBuildResult,
  type LanguageDiagnostic,
  type LinkProjectResult
} from '@insight/language';
import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { requireUserId, sourcesForProjectWithOverlays } from '$lib/server/repository/project-file-service';
import { requestLimits, validateOverlays, validateQuery } from '$lib/server/security/request-limits';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { incrementAnalysisMetric, observeAnalysis } from './analysis-observability';
import { ProjectAnalysisCache, projectAnalysisCache, type ProjectAnalysis } from './project-analysis-cache';
import type {
  DiagnosticDto,
  LinkRequest,
  LinkResponse,
  ProjectStructureRequest,
  ProjectStructureResponse
} from './types';

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });

export async function symbols(cookies: Cookies, env: EnvSource | undefined, projectId: string) {
  requireRuntimeProfile(env, 'editor');
  const ownerId = await requireUserId(cookies, env);
  return symbolsForProject(env, ownerId, projectId);
}

export async function symbolsForProject(env: EnvSource | undefined, ownerId: string, projectId: string) {
  const analysis = await analyzeStoredProject(env, ownerId, projectId, {});
  return analysis.snapshotBuild.snapshot;
}

export async function symbolsForSources(sources: ReadonlyMap<string, string>) {
  const analysis = await transientAnalysis(sources, {}, undefined);
  return analysis.snapshotBuild.snapshot;
}

export async function structure(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  requireRuntimeProfile(env, 'editor');
  validateRequest(request, env);
  const ownerId = await requireUserId(cookies, env);
  return structureForProject(env, ownerId, projectId, request);
}

export async function structureForProject(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, env);
  const analysis = await analyzeStoredProject(env, ownerId, projectId, request?.overlays ?? {});
  return projectStructure(withSnapshotDiagnostics(analysis.result, analysis.snapshotBuild));
}

export async function structureForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, env);
  const analysis = await transientAnalysis(sources, request?.overlays ?? {}, env);
  return projectStructure(withSnapshotDiagnostics(analysis.result, analysis.snapshotBuild));
}

export async function link(
  cookies: Cookies,
  env: EnvSource | undefined,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  requireRuntimeProfile(env, 'editor');
  validateRequest(request, env);
  const ownerId = await requireUserId(cookies, env);
  return linkForProject(env, ownerId, projectId, request);
}

export async function linkForProject(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, env);
  const analysis = await analyzeStoredProject(env, ownerId, projectId, request?.overlays ?? {});
  return linkFromAnalysis(analysis, request, env);
}

export async function linkForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, env);
  return linkFromAnalysis(await transientAnalysis(sources, request?.overlays ?? {}, env), request, env);
}

export async function linkForStoredSources(
  env: EnvSource | undefined,
  cacheKey: string,
  sources: ReadonlyMap<string, string>,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, env);
  const analysis = await projectAnalysisCache.analyze(cacheKey, sources, request?.overlays ?? {}, env);
  return linkFromAnalysis(analysis, request, env);
}

export async function structureForStoredSources(
  env: EnvSource | undefined,
  cacheKey: string,
  sources: ReadonlyMap<string, string>,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, env);
  const analysis = await projectAnalysisCache.analyze(cacheKey, sources, request?.overlays ?? {}, env);
  return projectStructure(withSnapshotDiagnostics(analysis.result, analysis.snapshotBuild));
}

export async function symbolsForStoredSources(
  env: EnvSource | undefined,
  cacheKey: string,
  sources: ReadonlyMap<string, string>
) {
  return (await projectAnalysisCache.analyze(cacheKey, sources, {}, env)).snapshotBuild.snapshot;
}

function linkFromAnalysis(analysis: ProjectAnalysis, request: LinkRequest | null, env: EnvSource | undefined): LinkResponse {
  const resultWithSnapshotDiagnostics = withSnapshotDiagnostics(analysis.result, analysis.snapshotBuild);
  const diagnostics = resultWithSnapshotDiagnostics.diagnostics.map(diagnostic);
  const renderStarted = performance.now();
  const renders = diagnostics.some((item) => item.level === 'ERROR')
    ? []
    : renderPaths(request, resultWithSnapshotDiagnostics).flatMap((sourceIdentity) => {
      const context = resultWithSnapshotDiagnostics.contexts.find((candidate) => candidate.sourceIdentity === sourceIdentity);
      try {
        return [
          {
            sourceIdentity,
            diagram: 'query',
            dot: service.render({
              result: resultWithSnapshotDiagnostics,
              scope: {
                context: context?.id,
                tab: sourceIdentity,
                ...(request?.view == null ? {} : { view: request.view }),
                ...(request?.environment == null ? {} : { environment: request.environment })
              },
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
  incrementAnalysisMetric('queryDotGenerations', renders.length);
  observeAnalysis(env, 'language.query-render', {
    analysisMode: analysis.mode,
    renderCount: renders.length,
    durationMs: Math.round((performance.now() - renderStarted) * 100) / 100
  });

  return {
    revision: analysis.revision,
    analysis: {
      mode: analysis.mode,
      relinkedSources: analysis.relinkedSources
    },
    symbols: analysis.snapshotBuild.snapshot,
    linkedModel: {
      ...resultWithSnapshotDiagnostics,
      graph: {
        nodes: resultWithSnapshotDiagnostics.graph.nodes(),
        relations: resultWithSnapshotDiagnostics.graph.relations()
      }
    },
    diagnostics,
    renders,
    structure: projectStructure(resultWithSnapshotDiagnostics)
  };
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
  const view = 'view' in (request ?? {}) ? (request as LinkRequest).view : undefined;
  if (view != null && !isBuiltinDiagramView(view)) {
    throw new Error('Invalid built-in diagram view');
  }
  if ('environment' in (request ?? {})) {
    const environment = (request as LinkRequest).environment;
    if (environment != null && (typeof environment !== 'string' || environment.length > 256)) {
      throw new Error('Invalid deployment environment');
    }
  }
}

async function analyzeStoredProject(
  env: EnvSource | undefined,
  ownerId: string,
  projectId: string,
  overlays: Readonly<Record<string, string>>
): Promise<ProjectAnalysis> {
  const storedSources = await sourcesForProjectWithOverlays(env, ownerId, projectId, {});
  return projectAnalysisCache.analyze(`owner:${ownerId}\0project:${projectId}`, storedSources, overlays, env);
}

async function transientAnalysis(
  sources: ReadonlyMap<string, string>,
  overlays: Readonly<Record<string, string>>,
  env: EnvSource | undefined
): Promise<ProjectAnalysis> {
  const transientCache = new ProjectAnalysisCache();
  return transientCache.analyze('transient', sources, overlays, env);
}

function renderPaths(request: LinkRequest | null, result: LinkProjectResult): string[] {
  const requested = request?.openSourceIdentities?.filter((sourceIdentity) => sourceIdentity.trim() !== '') ?? [];
  if (request?.openSourceIdentities != null) {
    return [...new Set(requested)];
  }
  return result.contexts.filter((context) => context.synthetic !== true).map((context) => context.sourceIdentity);
}

function projectStructure(result: LinkProjectResult): ProjectStructureResponse {
  return filterProjectStructure(buildProjectStructure(result), { includeSyntheticContexts: false });
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
