import { parentPort, workerData } from 'node:worker_threads';
import { instance } from '@viz-js/viz';
import { inlineGraphvizIcons, normalizeGraphvizSvgResult } from '@archinsight/graphviz';
import { pngFonts } from '@archinsight/graphviz/png-fonts';
import { stylePngText } from '@archinsight/graphviz/png-text';
import { renderPng } from 'resvg-napi/helpers';
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
    const result = await renderSvg(viz, item.dot, item.icons);
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

async function renderSvg(viz, dot, icons) {
  const result = normalizeGraphvizSvgResult(viz.render(dot, { format: 'svg', engine: 'dot' }));
  if (result.status === 'failure') {
    throw new Error(result.error);
  }
  return {
    svg: await inlineGraphvizIcons(result.svg, icons),
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
  const png = renderPng(stylePngText(svg), {
    dpi, fonts: pngFonts(), fontFamily: 'Carlito', maxPixels: limits.maxPngPixels
  });
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  validatePngDimensions(width, height, limits);
  if (png.byteLength > limits.maxPngBytes) {
    throw new Error(`PNG output is too large: ${png.byteLength}`);
  }
  return {
    sourceIdentity: item.sourceIdentity,
    diagram: item.diagram,
    dpi,
    width,
    height,
    contentType: 'image/png',
    png: png.toString('base64')
  };
}
