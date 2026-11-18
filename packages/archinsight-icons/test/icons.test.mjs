import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  loadTechnologyIconSvg,
  resolveExplicitIcon,
  resolveTechnologyIcon,
  searchTechnologyIcons,
} from '../src/index.js';
import { buildTechnologyIconContactSheets } from '../scripts/contact-sheet.mjs';

test('technology matching is deterministic and respects boundaries and source order', () => {
  assert.deepEqual(resolveTechnologyIcon(['SvelteKit, Quarkus, Java']), {
    id: 'svelte', label: 'Svelte', variant: 'plain', matchedBy: 'alias',
  });
  assert.equal(resolveTechnologyIcon(['Managed Kafka'])?.id, 'apachekafka');
  assert.equal(resolveTechnologyIcon(['Managed Kafka'])?.matchedBy, 'alias');
  assert.equal(resolveTechnologyIcon(['PostgreSQL 16'])?.id, 'postgresql');
  assert.equal(resolveTechnologyIcon(['Node.js HTTP'])?.id, 'nodejs');
  assert.equal(resolveTechnologyIcon(['JavaScript'])?.matchedBy, 'id');
  assert.equal(resolveTechnologyIcon(['FastAPI'])?.id, 'fastapi');
  assert.equal(resolveTechnologyIcon(['HTTPS, JSON']), undefined);
  assert.equal(resolveTechnologyIcon(['Web browser']), undefined);
});

test('explicit icon resolution supports stable ids, none, and suggestions', () => {
  assert.deepEqual(resolveExplicitIcon('postgresql'), { status: 'resolved', id: 'postgresql' });
  assert.deepEqual(resolveExplicitIcon('dot-net'), { status: 'resolved', id: 'dot-net' });
  assert.deepEqual(resolveExplicitIcon('none'), { status: 'disabled' });
  const unknown = resolveExplicitIcon('postgre');
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.suggestions[0], 'postgresql');
});

test('search is bounded and assets are normalized self-contained SVG', async () => {
  assert(searchTechnologyIcons('', 5).length <= 5);
  assert.equal(searchTechnologyIcons('kaf', 5)[0]?.id, 'apachekafka');
  const svg = await loadTechnologyIconSvg('postgresql');
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /currentColor/);
  assert.doesNotMatch(svg, /<script|<image|(?:href|url)=["']https?:/i);
  assert.equal(await loadTechnologyIconSvg('missing'), undefined);
});

test('generated audit records explicit alias-conflict decisions and every exclusion', async () => {
  const audit = JSON.parse(await readFile(new URL('../src/generated/audit.json', import.meta.url), 'utf8'));
  assert.equal(audit.entries.length, audit.included);
  assert.equal(audit.included + audit.excluded.length, audit.total);
  assert(audit.excluded.every(({ reason }) => typeof reason === 'string' && reason.length > 0));
  assert.deepEqual(audit.aliases.conflicts.find(({ alias }) => alias === 'jestjs'), {
    alias: 'jestjs', candidates: ['jekyll', 'jest'], resolution: 'ambiguous-excluded',
  });
});

test('builds chunked all-icon contact sheets in light and dark themes', async () => {
  for (const theme of ['light', 'dark']) {
    const sheets = await buildTechnologyIconContactSheets(theme);
    assert(sheets.length > 1);
    assert.equal(sheets.reduce((count, svg) => count + (svg.match(/class="technology-icon-contact"/g)?.length ?? 0), 0), 616);
    assert(sheets.every((svg) => {
      const withoutNamespaces = svg
        .replaceAll('http://www.w3.org/2000/svg', '')
        .replaceAll('http://www.w3.org/1999/xlink', '');
      return svg.startsWith('<svg') && !/https?:\/\//.test(withoutNamespaces);
    }));
  }
});
