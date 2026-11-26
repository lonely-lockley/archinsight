// Both the editor and VS Code rasterize SVG in a browser. Inspect pixels after
// the PNG has been encoded and decoded so a successful download alone cannot pass.
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright-chromium';
import { fileURLToPath } from 'node:url';
import { prepareWebviewPng } from '../src/png-fonts.ts';
import { previewHtml } from '../src/preview-webview.ts';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="75">
  <rect width="180" height="75" fill="white"/>
  <g class="node"><rect width="175" height="34" fill="#eee"/>
    <text x="5" y="25" fill="red" font-family="Times,serif" font-size="20" font-weight="bold">Заказы</text>
  </g>
  <g class="edge"><path d="M2 69h170" stroke="black"/>
    <text x="5" y="61" fill="blue" font-family="Times,serif" font-size="18">HTTPS</text>
  </g>
</svg>`;

test('web and VS Code PNG exports paint node and edge labels', { timeout: 30_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { outputFiles } = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
      contents: `export { svgToPngBlob } from '../archinsight-web/src/lib/workspace/diagram/download.ts';
        export { sanitizeSvg } from '@archinsight/workbench/svg-sanitizer';
        export { exportPng } from './src/webview/export-png.ts';`
    },
    nodePaths: [fileURLToPath(new URL('../node_modules', import.meta.url))],
    loader: { '.woff2': 'dataurl' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', globalName: 'diagramExport'
  });

  for (const surface of ['web', 'VS Code workbench', 'VS Code standalone preview']) {
    await t.test(surface, async () => {
      const page = await browser.newPage();
      try {
        if (surface === 'VS Code standalone preview') {
          await page.evaluate(() => {
            window.acquireVsCodeApi = () => ({
              postMessage(message) {
                if (message.command === 'png') window.receivePng(message.dataUrl);
              }
            });
          });
          await page.setContent(previewHtml());
        } else {
          await page.addScriptTag({ content: outputFiles[0].text });
        }

        const webfonts = fileURLToPath(new URL('../../packages/archinsight-graphviz/src/webfonts/', import.meta.url));
        await page.exposeFunction('preparePngForWebview', svg => prepareWebviewPng(svg, webfonts));
        await page.evaluate(surface => {
          window.exportDiagram = async svg => {
            if (surface === 'web') return diagramExport.svgToPngBlob(diagramExport.sanitizeSvg(svg));
            svg = await window.preparePngForWebview(svg);
            const dataUrl = await new Promise(resolve => {
              if (surface === 'VS Code workbench') {
                diagramExport.exportPng(svg, { postMessage: message => resolve(message.dataUrl) });
              } else {
                window.receivePng = resolve;
                window.postMessage({ command: 'exportPng', svg }, '*');
              }
            });
            if (!dataUrl) throw new Error('PNG export failed');
            const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
            return new Blob([bytes], { type: 'image/png' });
          };
        }, surface);
        const ink = await page.evaluate(async svg => {
          const blob = await window.exportDiagram(svg);
          const image = await createImageBitmap(blob);
          const ctx = new OffscreenCanvas(image.width, image.height).getContext('2d');
          ctx.drawImage(image, 0, 0);
          const { data } = ctx.getImageData(0, 0, image.width, image.height);
          let node = 0, edge = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > data[i + 2] + 64) node++;
            if (data[i + 2] > data[i] + 64) edge++;
          }
          return { node, edge, width: image.width, height: image.height };
        }, svg);
        assert.equal(ink.width, 180);
        assert.equal(ink.height, 75);
        assert(ink.node > 20, 'missing Cyrillic node label');
        assert(ink.edge > 20, 'missing edge label');

        const emoji = await page.evaluate(async () => {
          const glyphs = [];
          for (const label of ['🚀', '🔒', '👩‍💻', '👩💻', '\u0378']) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="48"><text x="2" y="36" font-size="32" font-weight="bold" font-family="Times,serif">${label} Клиент</text></svg>`;
            const image = await createImageBitmap(await window.exportDiagram(svg));
            const ctx = new OffscreenCanvas(210, 48).getContext('2d');
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, 210, 48).data;
            const xs = [];
            const ink = [];
            for (let i = 0; i < pixels.length; i += 4) {
              const [r, g, b] = pixels.subarray(i, i + 3);
              if (pixels[i + 3] > 32 && Math.max(r, g, b) - Math.min(r, g, b) > 55) {
                xs.push((i >> 2) % 210);
                ink.push(i);
              }
            }
            glyphs.push({ signature: ink.join(','), width: xs.length && Math.max(...xs) - Math.min(...xs) + 1 });
          }
          return glyphs;
        });
        assert(emoji.slice(0, 4).every(glyph => glyph.width > 0));
        assert.equal(new Set(emoji.map(glyph => glyph.signature)).size, emoji.length, 'emoji must differ from each other and the missing glyph');
        assert(emoji[2].width < emoji[3].width * 0.8, 'ZWJ sequence must shape as a single glyph');

        // A failed canvas allocation must reject the download instead of saving a blank PNG.
        await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null; });
        await assert.rejects(page.evaluate(svg => window.exportDiagram(svg), svg), /Canvas is not available|PNG export failed/);
      } finally {
        await page.close();
      }
    });
  }
});
