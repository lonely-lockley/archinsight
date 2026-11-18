import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { technologyIconCatalog, loadTechnologyIconSvg } from '../src/index.js';
import { catalog, exactAliases, exactAliasKinds, searchTerms } from '../src/generated/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(readFileSync(path.join(root, 'src/generated/audit.json'), 'utf8'));
if (audit.source.version !== '2.18.0' || audit.included !== technologyIconCatalog().length || audit.total !== audit.included + audit.excluded.length) {
  throw new Error('Generated Devicon metadata is inconsistent');
}
const assets = [];
for (const entry of technologyIconCatalog()) {
  const svg = await loadTechnologyIconSvg(entry.id);
  if (svg === undefined || !svg.includes('<svg') || !svg.includes('currentColor')) throw new Error(`Missing normalized asset '${entry.id}'`);
  assets.push([entry.id, svg]);
}
const contentDigest = createHash('sha256')
  .update(JSON.stringify({ catalog, exactAliases, exactAliasKinds, searchTerms, assets }))
  .digest('hex');
if (contentDigest !== audit.contentDigest) throw new Error('Generated Devicon content digest is inconsistent');
if (!audit.excluded.every(({ id, reason }) => typeof id === 'string' && typeof reason === 'string' && reason.length > 0)) {
  throw new Error('Every excluded Devicon asset must have an audit reason');
}
if (!audit.aliases.conflicts.every(({ resolution }) => ['catalog-id', 'curated', 'ambiguous-excluded'].includes(resolution))) {
  throw new Error('Every alias conflict must have an explicit resolution');
}
const digest = createHash('sha256').update(JSON.stringify(technologyIconCatalog())).digest('hex');
console.log(`Verified ${technologyIconCatalog().length} technology icons (${digest.slice(0, 12)})`);
