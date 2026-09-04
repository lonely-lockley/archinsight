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
    svg: result.output,
    warnings: messages
  };
}
