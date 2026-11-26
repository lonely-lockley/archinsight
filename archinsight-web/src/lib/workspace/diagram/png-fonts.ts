import { embedPngFonts } from '@archinsight/graphviz/png-text';

const fonts = {
  'Carlito-Regular': () => import('@archinsight/graphviz/webfonts/Carlito-Regular.woff2?inline'),
  'Carlito-Bold': () => import('@archinsight/graphviz/webfonts/Carlito-Bold.woff2?inline'),
  'Carlito-Italic': () => import('@archinsight/graphviz/webfonts/Carlito-Italic.woff2?inline'),
  'Carlito-BoldItalic': () => import('@archinsight/graphviz/webfonts/Carlito-BoldItalic.woff2?inline'),
  NotoColorEmoji: () => import('@archinsight/graphviz/webfonts/NotoColorEmoji.woff2?inline')
};

export function prepareBrowserPng(svg: string): Promise<string> {
  return embedPngFonts(svg, async face => (await fonts[face]()).default);
}
