export const GRAPHVIZ_RENDER_FAILED = 'Graphviz render failed';

export function normalizeGraphvizSvgResult(result) {
  const messages = result.errors.map(({ message }) => message);
  if (result.status === 'failure') {
    return {
      status: 'failure',
      error: messages.filter(Boolean).join('\n') || GRAPHVIZ_RENDER_FAILED
    };
  }
  return {
    status: 'success',
    svg: stripGraphvizSvgTitles(result.output),
    warnings: messages
  };
}

/** Graphviz emits native SVG tooltips for every graph, node, and edge. */
export function stripGraphvizSvgTitles(svg) {
  return svg.replace(/<title>[\s\S]*?<\/title>/g, '');
}
