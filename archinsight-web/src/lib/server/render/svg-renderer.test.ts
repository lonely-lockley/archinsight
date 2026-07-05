import { describe, expect, it } from 'vitest';
import { renderSvg } from './svg-renderer';

describe('server SVG renderer', () => {
  it('renders backend-generated DOT to SVG', async () => {
    const response = await renderSvg([
      {
        sourceIdentity: 'app.ai',
        diagram: 'query',
        dot: 'digraph app { a -> b }'
      }
    ]);

    expect(response.diagnostics).toEqual([]);
    expect(response.svgs[0]).toMatchObject({
      sourceIdentity: 'app.ai',
      diagram: 'query'
    });
    expect(response.svgs[0].svg).toContain('<svg');
  });

  it('returns render diagnostics and fallback SVG for invalid DOT', async () => {
    const response = await renderSvg([
      {
        sourceIdentity: 'broken.ai',
        diagram: 'query',
        dot: 'digraph broken {'
      }
    ]);

    expect(response.diagnostics[0]).toMatchObject({
      source: 'broken.ai',
      level: 'ERROR',
      code: 'GRAPHVIZ_RENDER_FAILED',
      category: 'SYSTEM'
    });
    expect(response.svgs[0].svg).toContain('Graphviz SVG render unavailable');
  });
});
