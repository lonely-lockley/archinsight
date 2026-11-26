import { svgToCanvas } from '@archinsight/workbench/diagram-raster';

export async function exportPng(svg: string, host: { postMessage(message: { command: 'png'; dataUrl: string }): void }) {
  let dataUrl = '';
  try {
    dataUrl = (await svgToCanvas(svg)).toDataURL('image/png');
  } catch {
    // An empty result rejects the pending save in DiagramSession.
  }
  host.postMessage({ command: 'png', dataUrl });
}
