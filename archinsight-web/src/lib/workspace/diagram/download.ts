import { svgToCanvas } from '@archinsight/workbench/diagram-raster';

import { prepareBrowserPng } from './png-fonts';

const defaultFileName = 'untitled';

export type DownloadExtension = '.ai' | '.svg' | '.png' | '.dot' | '.csv' | '.json';

export function downloadText(fileName: string, content: string, type: string): void {
  downloadBlob(fileName, new Blob([content], { type }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function svgToPngBlob(svg: string): Promise<Blob> {
  const canvas = await svgToCanvas(await prepareBrowserPng(svg));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('PNG image could not be created'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export function fileNameWithExtension(title: string, extension: DownloadExtension): string {
  const cleanTitle = sanitizeFileName(title.trim() || defaultFileName);
  const base = cleanTitle.replace(/\.(?:aiq?|svg|png|dot|csv|json)$/i, '');
  return `${base}${extension}`;
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || defaultFileName;
}
