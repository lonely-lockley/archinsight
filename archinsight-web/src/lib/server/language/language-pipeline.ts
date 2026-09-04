import {
  buildProjectStructure,
  coreLanguageSnapshot,
  filterProjectStructure,
  InsightLanguageService,
  isBuiltinDiagramView,
  type LanguageDiagnostic,
  type LinkProjectResult
} from '@insight/language';
import type { Cookies } from '@sveltejs/kit';
import type { EnvSource } from '$lib/server/auth/auth-config';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { requireUserId, sourcesForProjectWithOverlays } from '$lib/server/repository/project-file-service';
import { requestLimits, validateOverlays, validateQuery } from '$lib/server/security/request-limits';
import { requireRuntimeProfile } from '$lib/server/config/runtime-profile';
import { invalidRequest } from '$lib/server/errors/application-error';
import { incrementAnalysisMetric, observeAnalysis } from './analysis-observability';
import { ProjectAnalysisCache, type ProjectAnalysis } from './project-analysis-cache';
import type {
  DiagnosticDto,
  LinkRequest,
  LinkResponse,
  ProjectStructureRequest,
  ProjectStructureResponse
} from './types';

const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });

export async function symbols(cookies: Cookies, services: ApplicationServices, projectId: string) {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  const ownerId = await requireUserId(cookies, services);
  return symbolsForProject(services, ownerId, projectId);
}

export async function symbolsForProject(services: ApplicationServices, ownerId: string, projectId: string) {
  const analysis = await analyzeStoredProject(services, ownerId, projectId, {});
  return analysis.snapshotBuild.snapshot;
}

export async function symbolsForSources(sources: ReadonlyMap<string, string>) {
  const analysis = await transientAnalysis(sources, {}, undefined);
  return analysis.snapshotBuild.snapshot;
}

export async function structure(
  cookies: Cookies,
  services: ApplicationServices,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  validateRequest(request, services.config.requestLimits);
  const ownerId = await requireUserId(cookies, services);
  return structureForProject(services, ownerId, projectId, request);
}

export async function structureForProject(
  services: ApplicationServices,
  ownerId: string,
  projectId: string,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, services.config.requestLimits);
  const analysis = await analyzeStoredProject(services, ownerId, projectId, request?.overlays ?? {});
  return projectStructure(analysis.result);
}

export async function structureForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, requestLimits(env));
  const analysis = await transientAnalysis(sources, request?.overlays ?? {}, env);
  return projectStructure(analysis.result);
}

export async function link(
  cookies: Cookies,
  services: ApplicationServices,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  requireRuntimeProfile(services.config.runtimeProfile, 'editor');
  validateRequest(request, services.config.requestLimits);
  const ownerId = await requireUserId(cookies, services);
  return linkForProject(services, ownerId, projectId, request);
}

export async function linkForProject(
  services: ApplicationServices,
  ownerId: string,
  projectId: string,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, services.config.requestLimits);
  const analysis = await analyzeStoredProject(services, ownerId, projectId, request?.overlays ?? {});
  return linkFromAnalysis(analysis, request, services.env);
}

export async function linkForSources(
  env: EnvSource | undefined,
  sources: ReadonlyMap<string, string>,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, requestLimits(env));
  return linkFromAnalysis(await transientAnalysis(sources, request?.overlays ?? {}, env), request, env);
}

export async function linkForStoredSources(
  services: ApplicationServices,
  cacheKey: string,
  sources: ReadonlyMap<string, string>,
  request: LinkRequest | null
): Promise<LinkResponse> {
  validateRequest(request, services.config.requestLimits);
  const analysis = await services.analysisCache.analyze(cacheKey, sources, request?.overlays ?? {}, services.env);
  return linkFromAnalysis(analysis, request, services.env);
}

export async function structureForStoredSources(
  services: ApplicationServices,
  cacheKey: string,
  sources: ReadonlyMap<string, string>,
  request: ProjectStructureRequest | null
): Promise<ProjectStructureResponse> {
  validateRequest(request, services.config.requestLimits);
  const analysis = await services.analysisCache.analyze(cacheKey, sources, request?.overlays ?? {}, services.env);
  return projectStructure(analysis.result);
}

export async function symbolsForStoredSources(
  services: ApplicationServices,
  cacheKey: string,
  sources: ReadonlyMap<string, string>
) {
  return (await services.analysisCache.analyze(cacheKey, sources, {}, services.env)).snapshotBuild.snapshot;
}

function linkFromAnalysis(analysis: ProjectAnalysis, request: LinkRequest | null, env: EnvSource | undefined): LinkResponse {
  const diagnostics = analysis.result.diagnostics.map(diagnostic);
  const renderStarted = performance.now();
  const renders = diagnostics.some((item) => item.level === 'ERROR')
    ? []
    : renderPaths(request, analysis.result).flatMap((sourceIdentity) => {
      const context = analysis.result.contexts.find((candidate) => candidate.sourceIdentity === sourceIdentity);
      try {
        return [
          {
            sourceIdentity,
            diagram: 'query',
            dot: service.render({
              result: analysis.result,
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
      ...analysis.result,
      graph: {
        nodes: analysis.result.graph.nodes(),
        relations: analysis.result.graph.relations()
      }
    },
    diagnostics,
    renders,
    structure: projectStructure(analysis.result)
  };
}

function validateRequest(
  request: LinkRequest | ProjectStructureRequest | null,
  limits: ReturnType<typeof requestLimits>
): void {
  validateQuery('query' in (request ?? {}) ? (request as LinkRequest).query : null, limits);
  validateOverlays(request?.overlays, limits);
  const view = 'view' in (request ?? {}) ? (request as LinkRequest).view : undefined;
  if (view != null && !isBuiltinDiagramView(view)) {
    throw invalidRequest('Invalid built-in diagram view');
  }
  if ('environment' in (request ?? {})) {
    const environment = (request as LinkRequest).environment;
    if (environment != null && (typeof environment !== 'string' || environment.length > 256)) {
      throw invalidRequest('Invalid deployment environment');
    }
  }
}

async function analyzeStoredProject(
  services: ApplicationServices,
  ownerId: string,
  projectId: string,
  overlays: Readonly<Record<string, string>>
): Promise<ProjectAnalysis> {
  const storedSources = await sourcesForProjectWithOverlays(services, ownerId, projectId, {});
  return services.analysisCache.analyze(
    `owner:${ownerId}\0project:${projectId}`,
    storedSources,
    overlays,
    services.env
  );
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
