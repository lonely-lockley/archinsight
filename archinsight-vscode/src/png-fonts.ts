import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { embedPngFonts } from '@archinsight/graphviz/png-text';

export function prepareWebviewPng(svg: string, directory: string): Promise<string> {
  return embedPngFonts(svg, async face => {
    const bytes = await readFile(path.join(directory, face + '.woff2'));
    return 'data:font/woff2;base64,' + bytes.toString('base64');
  });
}
