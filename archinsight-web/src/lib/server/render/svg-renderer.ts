import { instance, type Viz } from '@viz-js/viz';
import type { DiagnosticDto, DotRenderDto, SvgRenderDto, SvgRenderResponse } from '$lib/server/language/types';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { requestLimits, validateDot, validateRenderCount } from '$lib/server/security/request-limits';

let vizPromise: Promise<Viz> | undefined;

export async function renderSvg(renders: DotRenderDto[] | null | undefined, env?: EnvSource): Promise<SvgRenderResponse> {
  const limits = requestLimits(env);
  validateRenderCount((renders ?? []).length, limits);
  const diagnostics: DiagnosticDto[] = [];
  const svgs: SvgRenderDto[] = [];
  for (const item of renders ?? []) {
    try {
      validateDot(item.dot, limits);
      svgs.push({
        sourceIdentity: item.sourceIdentity,
        diagram: item.diagram,
        svg: await renderDot(item.dot)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({
        source: item.sourceIdentity,
        line: 1,
        column: 0,
        endLine: 1,
        endColumn: 1,
        level: 'ERROR',
        code: 'GRAPHVIZ_RENDER_FAILED',
        message,
        category: 'SYSTEM'
      });
      svgs.push({
        sourceIdentity: item.sourceIdentity,
        diagram: item.diagram,
        svg: fallbackSvg(item.dot, message)
      });
    }
  }
  return { diagnostics, svgs };
}

async function renderDot(dot: string): Promise<string> {
  const viz = await getViz();
  const result = viz.render(dot, { format: 'svg', engine: 'dot' });
  if (result.status === 'failure') {
    throw new Error(formatMessages(result.errors.map((error) => error.message)));
  }
  return result.output;
}

function getViz(): Promise<Viz> {
  vizPromise ??= instance();
  return vizPromise;
}

function formatMessages(messages: string[]): string {
  return messages.filter(Boolean).join('\n') || 'Graphviz render failed';
}

function fallbackSvg(dot: string, message: string): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#2e2e2e"/>
  <text x="32" y="48" fill="#f4f4f4" font-family="monospace" font-size="20">Graphviz SVG render unavailable</text>
  <text x="32" y="82" fill="#ffb86c" font-family="monospace" font-size="14">${escapeXml(message)}</text>
  <foreignObject x="32" y="112" width="1136" height="656">
    <pre xmlns="http://www.w3.org/1999/xhtml" style="color:#d8dee9;font:12px monospace;white-space:pre-wrap;margin:0">${escapeXml(dot)}</pre>
  </foreignObject>
</svg>
`.trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
