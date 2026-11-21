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

/** Inline referenced icon assets into Graphviz-generated HTML table slots. */
export async function inlineGraphvizIcons(svg, placements = []) {
  if (placements.length === 0) return svg;
  const { loadTechnologyIconSvg } = await import('@archinsight/icons');
  const placementsBySlot = new Map();
  for (const placement of placements) {
    if (placementsBySlot.has(placement.slotId)) {
      throw new Error(`Graphviz icon slot '${placement.slotId}' is duplicated`);
    }
    placementsBySlot.set(placement.slotId, placement);
  }
  const assets = new Map(await Promise.all([...new Set(placements.map(({ iconId }) => iconId))].map(async (iconId) => {
    const asset = await loadTechnologyIconSvg(iconId);
    if (asset === undefined) throw new Error(`Technology icon '${iconId}' is unavailable`);
    return [iconId, asset];
  })));
  const found = new Set();
  const result = svg.replace(
    /<g\b[^>]*><a\b[^>]*(?:xlink:href|href)="#([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/g>/g,
    (match, slotId, content) => {
      const placement = placementsBySlot.get(slotId);
      if (placement === undefined) return match;
      found.add(slotId);
      return inlineIcon(placement, assets.get(placement.iconId), content);
    }
  );
  const missing = placements.find(({ slotId }) => !found.has(slotId));
  if (missing !== undefined) throw new Error(`Graphviz icon slot '${missing.slotId}' is missing`);
  return result;
}

function inlineIcon(placement, asset, content) {
  const points = /<polygon\b[^>]*\bpoints="([^"]+)"[^>]*\/>/.exec(content)?.[1];
  const bounds = polygonBounds(points);
  if (bounds === undefined) throw new Error(`Graphviz icon slot '${placement.slotId}' has no geometry`);
  const padding = Math.min(4, bounds.width / 5, bounds.height / 5);
  const color = escapeXml(placement.color);
  const nested = asset.replaceAll('currentColor', color).replace(/<svg\b([^>]*)>/i, (_root, attributes) => {
    const cleaned = attributes.replace(/\s(?:x|y|width|height|color|preserveAspectRatio|pointer-events)="[^"]*"/gi, '');
    return `<svg${cleaned} x="${number(bounds.x + padding)}" y="${number(bounds.y + padding)}" width="${number(bounds.width - padding * 2)}" height="${number(bounds.height - padding * 2)}" preserveAspectRatio="xMidYMid meet" pointer-events="none">`;
  });
  return `<g id="${escapeXml(placement.slotId)}" class="technology-icon" pointer-events="none">${nested}</g>`;
}

function polygonBounds(points) {
  if (points === undefined) return undefined;
  const coordinates = points.trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  if (coordinates.length < 3 || coordinates.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return undefined;
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return width <= 0 || height <= 0 ? undefined : { x, y, width, height };
}

function number(value) {
  return String(Math.round(value * 1000) / 1000);
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
