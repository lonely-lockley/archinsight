import type { DiagnosticDto, DotRenderDto, SvgRenderDto, SvgRenderResponse } from '$lib/server/language/types';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { requestLimits, validateDot, validateRenderCount } from '$lib/server/security/request-limits';
import { getRendererConfig, rendererSvgUrl, type RendererConfig } from './renderer-config';
import { incrementAnalysisMetric, observeAnalysis } from '$lib/server/language/analysis-observability';

type RendererResponse = {
  diagnostics?: unknown;
  svgs?: unknown;
  warnings?: unknown;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const defaultFetch: typeof fetch = (...args) => fetch(...args);

export async function renderSvg(
  renders: DotRenderDto[] | null | undefined,
  env?: EnvSource,
  fetcher: typeof fetch = defaultFetch
): Promise<SvgRenderResponse> {
  const requested = renders ?? [];
  const limits = requestLimits(env);
  validateRenderCount(requested.length, limits);
  for (const item of requested) {
    validateDot(item.dot, limits);
  }
  if (requested.length === 0) {
    return { diagnostics: [], svgs: [] };
  }

  const config = getRendererConfig(env);
  if (!config.enabled) {
    return renderFailure(requested, 'EXTERNAL_RENDERER_DISABLED', 'External renderer fallback is disabled');
  }

  const started = performance.now();
  incrementAnalysisMetric('graphvizRenders', requested.length);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetcher(rendererSvgUrl(config), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ renders: requested }),
      redirect: 'error',
      signal: controller.signal
    });
    const body = await readLimitedBody(response, config.maxResponseBytes);
    if (!response.ok) {
      throw new Error(`External renderer returned HTTP ${response.status}: ${rendererError(body)}`);
    }
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
      throw new Error('External renderer returned a non-JSON response');
    }
    const result = validateRendererResponse(JSON.parse(body) as RendererResponse, requested, config);
    observeAnalysis(env, 'graphviz.render', {
      mode: 'external',
      renderCount: requested.length,
      success: true,
      durationMs: elapsed(started)
    });
    return result;
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `External renderer timed out after ${config.timeoutMs} ms`
      : error instanceof Error ? error.message : String(error);
    observeAnalysis(env, 'graphviz.render', {
      mode: 'external',
      renderCount: requested.length,
      success: false,
      durationMs: elapsed(started)
    });
    return renderFailure(requested, 'EXTERNAL_RENDERER_FAILED', message);
  } finally {
    clearTimeout(timeout);
  }
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 100) / 100;
}

function validateRendererResponse(
  response: RendererResponse,
  requested: DotRenderDto[],
  config: RendererConfig
): SvgRenderResponse {
  if (!Array.isArray(response.svgs)) {
    throw new Error('External renderer response does not contain an SVG array');
  }
  if (response.svgs.length > requested.length) {
    throw new Error('External renderer returned too many SVGs');
  }

  const expected = new Map(requested.map((item) => [renderKey(item.sourceIdentity, item.diagram), item]));
  const seen = new Set<string>();
  const svgs: SvgRenderDto[] = [];
  let totalSvgBytes = 0;
  for (const [index, value] of response.svgs.entries()) {
    if (!isRecord(value)) {
      throw new Error(`External renderer SVG ${index} is invalid`);
    }
    const sourceIdentity = requiredString(value.sourceIdentity, `SVG ${index} sourceIdentity`);
    const diagram = requiredString(value.diagram, `SVG ${index} diagram`);
    const svg = requiredString(value.svg, `SVG ${index} content`);
    const key = renderKey(sourceIdentity, diagram);
    if (!expected.has(key) || seen.has(key)) {
      throw new Error(`External renderer returned an unexpected SVG: ${sourceIdentity}/${diagram}`);
    }
    seen.add(key);
    const svgBytes = encoder.encode(svg).byteLength;
    if (svgBytes > config.maxSvgBytes) {
      throw new Error(`External renderer SVG is too large: ${svgBytes} bytes`);
    }
    totalSvgBytes += svgBytes;
    if (totalSvgBytes > config.maxTotalSvgBytes) {
      throw new Error(`External renderer SVG response is too large: ${totalSvgBytes} bytes`);
    }
    svgs.push({ sourceIdentity, diagram, svg });
  }

  if (svgs.length !== requested.length) {
    throw new Error('External renderer did not return every requested SVG');
  }

  const diagnostics = rendererDiagnostics(response.diagnostics);
  const warnings = Array.isArray(response.warnings)
    ? response.warnings.slice(0, 100).filter((warning): warning is string => typeof warning === 'string')
    : [];
  for (const warning of warnings) {
    diagnostics.push(systemDiagnostic(requested[0].sourceIdentity, 'WARNING', 'GRAPHVIZ_RENDER_WARNING', warning.slice(0, 4_096)));
  }
  return { diagnostics, svgs };
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel('response too large');
        throw new Error(`External renderer response exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(body);
}

function rendererDiagnostics(value: unknown): DiagnosticDto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 100).flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== 'string') {
      return [];
    }
    return [systemDiagnostic(
      typeof item.source === 'string' ? item.source : 'renderer',
      item.level === 'WARNING' || item.level === 'NOTE' ? item.level : 'ERROR',
      typeof item.code === 'string' ? item.code : 'GRAPHVIZ_RENDER_FAILED',
      item.message.slice(0, 4_096)
    )];
  });
}

function renderFailure(renders: DotRenderDto[], code: string, message: string): SvgRenderResponse {
  return {
    diagnostics: renders.map((item) => systemDiagnostic(item.sourceIdentity, 'ERROR', code, message)),
    svgs: []
  };
}

function systemDiagnostic(source: string, level: string, code: string, message: string): DiagnosticDto {
  return {
    source,
    line: 1,
    column: 0,
    endLine: 1,
    endColumn: 1,
    level,
    code,
    message,
    category: 'SYSTEM'
  };
}

function rendererError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error.slice(0, 4_096) : 'render failed';
  } catch {
    return body.slice(0, 4_096) || 'render failed';
  }
}

function renderKey(sourceIdentity: string, diagram: string): string {
  return `${sourceIdentity}\u0000${diagram}`;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
