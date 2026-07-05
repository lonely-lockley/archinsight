import { instance, type Viz } from '@viz-js/viz';
import type { DotRender, SvgRender } from './api';

type RenderRequest = {
  requestId: number;
  renders: DotRender[];
};

type RenderResponse = {
  requestId: number;
  svgs?: SvgRender[];
  warnings?: string[];
  error?: string;
};

let vizPromise: Promise<Viz> | undefined;

function getViz(): Promise<Viz> {
  vizPromise ??= instance();
  return vizPromise;
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  void render(event.data);
};

async function render(request: RenderRequest): Promise<void> {
  try {
    const viz = await getViz();
    const svgs: SvgRender[] = [];
    const warnings: string[] = [];
    for (const item of request.renders) {
      const result = viz.render(item.dot, { format: 'svg', engine: 'dot' });
      if (result.status === 'failure') {
        throw new Error(formatMessages(result.errors.map((error) => error.message)));
      }
      for (const warning of result.errors) {
        warnings.push(warning.message);
      }
      svgs.push({
        sourceIdentity: item.sourceIdentity,
        diagram: item.diagram,
        svg: result.output
      });
    }
    post({ requestId: request.requestId, svgs, warnings });
  } catch (error) {
    post({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function formatMessages(messages: string[]): string {
  return messages.filter(Boolean).join('\n') || 'Graphviz render failed';
}

function post(response: RenderResponse): void {
  self.postMessage(response);
}
