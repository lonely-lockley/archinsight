import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTechnologyIconSvg, technologyIconCatalog } from '../src/index.js';

const columns = 6;
const rows = 10;
const cellWidth = 150;
const cellHeight = 104;

export async function buildTechnologyIconContactSheets(theme) {
  if (theme !== 'light' && theme !== 'dark') throw new Error(`Unknown contact-sheet theme '${theme}'`);
  const entries = technologyIconCatalog();
  const sheets = [];
  for (let offset = 0; offset < entries.length; offset += columns * rows) {
    const chunk = entries.slice(offset, offset + columns * rows);
    const icons = await Promise.all(chunk.map(async (entry) => ({ entry, svg: await loadTechnologyIconSvg(entry.id) })));
    sheets.push(contactSheetSvg(icons, theme));
  }
  return sheets;
}

function contactSheetSvg(icons, theme) {
  const background = theme === 'dark' ? '#202020' : '#ffffff';
  const color = theme === 'dark' ? '#f4f4f4' : '#202020';
  const actualRows = Math.max(1, Math.ceil(icons.length / columns));
  const cells = icons.map(({ entry, svg }, index) => {
    if (svg === undefined) throw new Error(`Missing contact-sheet icon '${entry.id}'`);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * cellHeight;
    const nested = svg.replace('<svg', `<svg x="${x + 51}" y="${y + 10}" width="48" height="48"`);
    return `<g class="technology-icon-contact" color="${color}">${nested}<text x="${x + cellWidth / 2}" y="${y + 82}" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="12">${escapeXml(entry.id)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns * cellWidth} ${actualRows * cellHeight}" width="${columns * cellWidth}" height="${actualRows * cellHeight}"><rect width="100%" height="100%" fill="${background}"/>${cells}</svg>`;
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[2] ?? 'build/icon-contact-sheets');
  await mkdir(output, { recursive: true });
  for (const theme of ['light', 'dark']) {
    const sheets = await buildTechnologyIconContactSheets(theme);
    await Promise.all(sheets.map((svg, index) => writeFile(path.join(output, `technology-icons-${theme}-${String(index + 1).padStart(2, '0')}.svg`), svg)));
  }
  console.log(`Wrote technology icon contact sheets to ${output}`);
}
