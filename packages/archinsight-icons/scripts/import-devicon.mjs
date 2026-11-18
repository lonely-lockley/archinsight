import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSvg } from './svg-import.mjs';

const DEVICON_VERSION = '2.18.0';
const DEVICON_SHA512 = '8e62d93dd4df3bd7741a59d35fc430d92c598fbd4ccba58054466d826584ad58eefee494aa69368712b35e8f4fc3b21fa95f4f13070e2abcb0640d5eb6bc913c';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arguments_ = process.argv.slice(2);
const allowIdChanges = arguments_.includes('--allow-id-changes');
const archive = path.resolve(arguments_.find((value) => !value.startsWith('--')) ?? 'devicon-2.18.0.tgz');
const generatedRoot = path.join(packageRoot, 'src', 'generated');
const curatedAliases = {
  'apache kafka': 'apachekafka', kafka: 'apachekafka',
  aws: 'amazonwebservices', 'amazon web services': 'amazonwebservices',
  'c#': 'csharp', 'c++': 'cplusplus', '.net': 'dot-net', dotnet: 'dot-net',
  'node.js': 'nodejs', node: 'nodejs', postgres: 'postgresql',
  sveltekit: 'svelte', 'svelte kit': 'svelte',
  traefik: 'traefikproxy', 'traefik proxy': 'traefikproxy',
};
const curatedIds = ['java', 'javascript', 'typescript', 'nodejs', 'postgresql', 'docker', 'kubernetes', 'github', 'svelte', 'quarkus', 'apachekafka', 'traefikproxy'];

verifyArchive(archive);
const previous = previousImportState();
const temporary = mkdtempSync(path.join(tmpdir(), 'archinsight-devicon-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', temporary, 'package/devicon.json', 'package/LICENSE', 'package/icons']);
  const sourceRoot = path.join(temporary, 'package');
  const manifest = JSON.parse(readFileSync(path.join(sourceRoot, 'devicon.json'), 'utf8'));
  const included = [];
  const excluded = [];
  const assets = new Map();

  for (const entry of manifest) {
    const selected = selectVariant(sourceRoot, entry);
    if (selected === undefined) {
      excluded.push({ id: entry.name, reason: 'no supported non-wordmark SVG variant' });
      continue;
    }
    const validation = normalizeSvg(readFileSync(selected.file, 'utf8'));
    if (validation.error !== undefined) {
      excluded.push({ id: entry.name, variant: selected.variant, reason: validation.error });
      continue;
    }
    included.push({ id: entry.name, label: displayLabel(entry.name), variant: selected.variant, features: validation.features });
    assets.set(entry.name, validation.svg);
  }

  included.sort((left, right) => left.id.localeCompare(right.id));
  excluded.sort((left, right) => left.id.localeCompare(right.id));

  const includedIds = new Set(included.map(({ id }) => id));
  const invalidCurated = Object.entries(curatedAliases).filter(([, id]) => !includedIds.has(id));
  if (invalidCurated.length > 0) throw new Error(`Curated aliases reference excluded icons: ${JSON.stringify(invalidCurated)}`);
  for (const id of curatedIds) if (!includedIds.has(id)) throw new Error(`Curated icon '${id}' was excluded`);

  const aliasCandidates = new Map();
  const searchTerms = {};
  for (const { id } of included) addAliasCandidate(aliasCandidates, id, id, 'id');
  for (const [alias, id] of Object.entries(curatedAliases)) addAliasCandidate(aliasCandidates, alias, id, 'alias');
  for (const entry of manifest) {
    if (!includedIds.has(entry.name)) continue;
    const terms = [...new Set([...(entry.altnames ?? []), ...(entry.tags ?? []), ...Object.entries(curatedAliases).filter(([, id]) => id === entry.name).map(([alias]) => alias)]
      .map(normalizeTerm).filter(Boolean))].sort();
    searchTerms[entry.name] = terms;
    for (const alternate of entry.altnames ?? []) addAliasCandidate(aliasCandidates, alternate, entry.name, 'alternate-name');
  }

  const exactAliases = {};
  const exactAliasKinds = {};
  const aliasConflicts = [];
  for (const [alias, candidates] of [...aliasCandidates].sort(([left], [right]) => left.localeCompare(right))) {
    const distinctIds = [...new Set(candidates.map(({ id }) => id))].sort();
    const catalogId = candidates.find(({ kind }) => kind === 'id');
    const curated = candidates.find(({ kind }) => kind === 'alias');
    const selected = distinctIds.length === 1 ? candidates[0] : catalogId ?? curated;
    if (selected !== undefined && !(selected.kind === 'id' && normalizeTerm(selected.id) === alias)) {
      exactAliases[alias] = selected.id;
      exactAliasKinds[alias] = selected.kind;
    }
    if (distinctIds.length > 1) aliasConflicts.push({
      alias,
      candidates: distinctIds,
      ...(selected === undefined
        ? { resolution: 'ambiguous-excluded' }
        : { resolution: selected.kind === 'id' ? 'catalog-id' : 'curated', selected: selected.id }),
    });
  }

  const currentIds = included.map(({ id }) => id);
  const changes = importChanges(previous, currentIds, included);
  if (previous.version === DEVICON_VERSION && (changes.added.length > 0 || changes.removed.length > 0)) {
    throw new Error(`Nondeterministic catalog IDs for Devicon ${DEVICON_VERSION}: ${JSON.stringify(changes)}`);
  }
  if (changes.removed.length > 0 && !allowIdChanges) {
    throw new Error(`Published icon IDs would be removed; review and rerun with --allow-id-changes: ${changes.removed.join(', ')}`);
  }

  const catalog = included.map(({ features: _features, ...entry }) => entry);
  const assetEntries = [...assets].sort(([left], [right]) => left.localeCompare(right));
  const contentDigest = createHash('sha256')
    .update(JSON.stringify({ catalog, exactAliases, exactAliasKinds, searchTerms, assets: assetEntries }))
    .digest('hex');

  rmSync(generatedRoot, { recursive: true, force: true });
  mkdirSync(path.join(generatedRoot, 'assets'), { recursive: true });
  writeFileSync(path.join(generatedRoot, 'catalog.js'), generatedModule({ catalog, curatedIds, exactAliases, exactAliasKinds, searchTerms }));
  for (const bucket of 'abcdefghijklmnopqrstuvwxyz'.split('').concat('other')) {
    const values = Object.fromEntries(assetEntries.filter(([id]) => bucketFor(id) === bucket));
    writeFileSync(path.join(generatedRoot, 'assets', `${bucket}.js`), `// Generated by import-devicon.mjs; do not edit.\nexport const icons = ${JSON.stringify(values)};\n`);
  }
  writeFileSync(path.join(generatedRoot, 'audit.json'), `${JSON.stringify({
    source: { name: 'devicon', version: DEVICON_VERSION, sha512: DEVICON_SHA512 },
    total: manifest.length,
    included: included.length,
    entries: included,
    excluded,
    aliases: { count: Object.keys(exactAliases).length, conflicts: aliasConflicts },
    features: {
      masks: included.filter(({ features }) => features.masks).map(({ id }) => id),
      clips: included.filter(({ features }) => features.clips).map(({ id }) => id),
      gradients: excluded.filter(({ reason }) => reason.includes('gradient')).map(({ id }) => id),
    },
    changes,
    contentDigest,
  }, null, 2)}\n`);
  writeFileSync(path.join(generatedRoot, 'DEVICON-LICENSE'), readFileSync(path.join(sourceRoot, 'LICENSE')));
  console.log(`Imported ${included.length}/${manifest.length} Devicon ${DEVICON_VERSION} icons`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function verifyArchive(file) {
  const bytes = readFileSync(file);
  const actual = createHash('sha512').update(bytes).digest('hex');
  if (actual !== DEVICON_SHA512) throw new Error(`Devicon archive checksum mismatch: ${actual}`);
}

function selectVariant(sourceRoot, entry) {
  for (const variant of ['plain', 'line', 'original']) {
    if (!entry.versions?.svg?.includes(variant)) continue;
    const file = path.join(sourceRoot, 'icons', entry.name, `${entry.name}-${variant}.svg`);
    if (!existsSync(file)) throw new Error(`Devicon manifest references missing asset '${entry.name}-${variant}.svg'`);
    return { variant, file };
  }
  return undefined;
}

function generatedModule(value) {
  return `// Generated by import-devicon.mjs; do not edit.\nexport const catalog = ${JSON.stringify(value.catalog)};\nexport const curatedIds = ${JSON.stringify(value.curatedIds)};\nexport const exactAliases = ${JSON.stringify(value.exactAliases)};\nexport const exactAliasKinds = ${JSON.stringify(value.exactAliasKinds)};\nexport const searchTerms = ${JSON.stringify(value.searchTerms)};\n`;
}

function displayLabel(id) {
  return id.replace(/(^|[-.])([a-z])/g, (_match, separator, letter) => `${separator === '-' ? ' ' : separator}${letter.toUpperCase()}`);
}

function normalizeTerm(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function bucketFor(id) {
  const first = id[0]?.toLowerCase();
  return first >= 'a' && first <= 'z' ? first : 'other';
}

function addAliasCandidate(target, rawAlias, id, kind) {
  const alias = normalizeTerm(rawAlias);
  if (alias.length === 0) return;
  target.set(alias, [...(target.get(alias) ?? []), { id, kind }]);
}

function previousImportState() {
  const auditFile = path.join(generatedRoot, 'audit.json');
  const catalogFile = path.join(generatedRoot, 'catalog.js');
  if (!existsSync(auditFile) || !existsSync(catalogFile)) return { version: undefined, ids: [], variants: {} };
  const audit = JSON.parse(readFileSync(auditFile, 'utf8'));
  const source = readFileSync(catalogFile, 'utf8');
  const catalogSource = /^export const catalog = (.*);$/m.exec(source)?.[1];
  const catalog = catalogSource === undefined ? [] : JSON.parse(catalogSource);
  return {
    version: audit.source?.version,
    ids: catalog.map(({ id }) => id),
    variants: Object.fromEntries(catalog.map(({ id, variant }) => [id, variant])),
  };
}

function importChanges(previous, currentIds, included) {
  const current = new Set(currentIds);
  const before = new Set(previous.ids);
  return {
    previousVersion: previous.version ?? null,
    added: currentIds.filter((id) => !before.has(id)),
    removed: previous.ids.filter((id) => !current.has(id)),
    variantChanged: included
      .filter(({ id, variant }) => previous.variants[id] !== undefined && previous.variants[id] !== variant)
      .map(({ id, variant }) => ({ id, before: previous.variants[id], after: variant })),
  };
}
