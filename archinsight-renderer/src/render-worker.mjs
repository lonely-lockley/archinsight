import { parentPort, workerData } from 'node:worker_threads';
import { instance } from '@viz-js/viz';
import { normalizeGraphvizSvgResult } from '@archinsight/graphviz';
import { Resvg } from '@resvg/resvg-js';
import {
  addOutputBytes,
  expectedPngDimensions,
  validatePngDimensions,
  validateSvgOutput
} from './output-limits.mjs';

try {
  const viz = await instance();
  const mode = workerData.mode ?? 'svg';
  const limits = workerData.limits;
  const rendered = [];
  const warnings = [];
  let outputBytes = 0;
  let warningBytes = 0;
  for (const item of workerData.renders) {
    const result = renderSvg(viz, item.dot);
    for (const warning of result.warnings) {
      warningBytes += Buffer.byteLength(warning, 'utf8');
      if (warningBytes > limits.maxWarningBytes) {
        throw new Error(`Graphviz warnings are too large: ${warningBytes}`);
      }
      warnings.push(warning);
    }
    const svgBytes = validateSvgOutput(result.svg, limits);
    if (mode === 'png') {
      const png = renderPngItem(item, result.svg, workerData.dpi, limits);
      outputBytes = addOutputBytes(outputBytes, Buffer.byteLength(png.png, 'utf8'), limits);
      rendered.push(png);
    } else {
      outputBytes = addOutputBytes(outputBytes, svgBytes, limits);
      rendered.push(renderSvgItem(item, result.svg));
    }
  }
  addOutputBytes(outputBytes, warningBytes, limits);
  parentPort.postMessage(mode === 'png'
    ? { pngs: rendered, warnings }
    : { svgs: rendered, warnings });
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error)
  });
}

function renderSvg(viz, dot) {
  const result = normalizeGraphvizSvgResult(viz.render(dot, { format: 'svg', engine: 'dot' }));
  if (result.status === 'failure') {
    throw new Error(result.error);
  }
  return {
    svg: result.svg,
    warnings: result.warnings
  };
}

function renderSvgItem(item, svg) {
  return {
    sourceIdentity: item.sourceIdentity,
    diagram: item.diagram,
    svg
  };
}

function renderPngItem(item, svg, dpi, limits) {
  const expected = expectedPngDimensions(svg, dpi);
  validatePngDimensions(expected.width, expected.height, limits);
  const image = new Resvg(svg, {
    dpi,
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'sans-serif'
    }
  }).render();
  validatePngDimensions(image.width, image.height, limits);
  const png = image.asPng();
  if (png.byteLength > limits.maxPngBytes) {
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
