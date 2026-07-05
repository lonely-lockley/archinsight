import { parentPort, workerData } from 'node:worker_threads';
import { instance } from '@viz-js/viz';
import { Resvg } from '@resvg/resvg-js';

try {
  const viz = await instance();
  const mode = workerData.mode ?? 'svg';
  const rendered = [];
  const warnings = [];
  for (const item of workerData.renders) {
    const svg = renderSvg(viz, item.dot, warnings);
    rendered.push(mode === 'png'
      ? renderPngItem(item, svg, workerData.dpi, workerData.maxPngBytes)
      : renderSvgItem(item, svg));
  }
  parentPort.postMessage(mode === 'png'
    ? { pngs: rendered, warnings }
    : { svgs: rendered, warnings });
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error)
  });
}

function renderSvg(viz, dot, warnings) {
  const result = viz.render(dot, { format: 'svg', engine: 'dot' });
  if (result.status === 'failure') {
    throw new Error(formatMessages(result.errors.map((error) => error.message)));
  }
  for (const warning of result.errors) {
    warnings.push(warning.message);
  }
  return result.output;
}

function renderSvgItem(item, svg) {
  return {
    sourceIdentity: item.sourceIdentity,
    diagram: item.diagram,
    svg
  };
}

function renderPngItem(item, svg, dpi, maxPngBytes) {
  const image = new Resvg(svg, {
    dpi,
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'sans-serif'
    }
  }).render();
  const png = image.asPng();
  if (png.byteLength > maxPngBytes) {
    throw new Error(`PNG output is too large: ${png.byteLength}`);
  }
  return {
    sourceIdentity: item.sourceIdentity,
    diagram: item.diagram,
    dpi,
    width: image.width,
    height: image.height,
    contentType: 'image/png',
    png: png.toString('base64')
  };
}

function formatMessages(messages) {
  return messages.filter(Boolean).join('\n') || 'Graphviz render failed';
}
