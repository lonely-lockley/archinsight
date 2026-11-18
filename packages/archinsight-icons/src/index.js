import { catalog, curatedIds, exactAliases, exactAliasKinds, searchTerms } from './generated/catalog.js';

const byId = new Map(catalog.map((entry) => [entry.id, entry]));
const excludedAutomaticIds = new Set(['json']);
const automaticAliases = buildAutomaticAliases();

/** Resolve an explicit @icon value. `none` intentionally resolves to no icon. */
export function resolveExplicitIcon(value) {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  if (normalized === 'none') return { status: 'disabled' };
  const entry = byId.get(normalized);
  return entry === undefined
    ? { status: 'unknown', suggestions: searchTechnologyIcons(value, 5).map(({ id }) => id) }
    : { status: 'resolved', id: entry.id };
}

/** Deterministically choose the first unambiguous icon from semantic technology values. */
export function resolveTechnologyIcon(values) {
  for (const rawValue of values) {
    for (const rawSegment of rawValue.split(',')) {
      const segment = normalizeTechnology(rawSegment);
      if (segment.length === 0) continue;
      const exact = automaticAliases.get(segment);
      if (exact?.length === 1) return matchResult(exact[0]);
      if (exact !== undefined) continue;

      const matches = [];
      for (const [alias, entries] of automaticAliases) {
        const offset = boundaryIndex(segment, alias);
        if (offset < 0) continue;
        for (const match of entries) matches.push({ ...match, offset, length: alias.length });
      }
      matches.sort((left, right) => left.offset - right.offset || right.length - left.length || left.entry.id.localeCompare(right.entry.id));
      const best = matches[0];
      if (best === undefined) continue;
      const equallyRanked = matches.filter(({ offset, length }) => offset === best.offset && length === best.length);
      if (new Set(equallyRanked.map(({ entry }) => entry.id)).size === 1) return matchResult(best);
    }
  }
  return undefined;
}

/** Bounded fuzzy search for completion and pickers. */
export function searchTechnologyIcons(query, limit = 50) {
  const boundedLimit = Math.max(0, Math.min(100, Math.floor(limit)));
  if (boundedLimit === 0) return [];
  const normalized = normalizeTechnology(query);
  if (normalized.length === 0) {
    return curatedIds.map((id) => byId.get(id)).filter(Boolean).slice(0, boundedLimit);
  }
  const compact = normalized.replace(/\s+/g, '');
  return catalog
    .map((entry) => ({ entry, score: searchScore(entry.id, compact, searchTerms[entry.id] ?? [], normalized) }))
    .filter(({ score }) => score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.entry.label.localeCompare(right.entry.label) || left.entry.id.localeCompare(right.entry.id))
    .slice(0, boundedLimit)
    .map(({ entry }) => entry);
}

export function technologyIcon(id) {
  return byId.get(id);
}

/** Assets are split into deterministic buckets so consumers only load referenced icon groups. */
export async function loadTechnologyIconSvg(id) {
  if (!byId.has(id)) return undefined;
  const bucket = bucketFor(id);
  const module = await assetBucket(bucket);
  return module.icons[id];
}

export function technologyIconCatalog() {
  return catalog;
}

export function normalizeTechnology(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildAutomaticAliases() {
  const result = new Map();
  for (const entry of catalog) {
    if (!excludedAutomaticIds.has(entry.id)) addAlias(result, normalizeTechnology(entry.id), entry, 'id');
  }
  for (const [alias, id] of Object.entries(exactAliases)) {
    const entry = byId.get(id);
    if (entry !== undefined && !excludedAutomaticIds.has(entry.id)) addAlias(result, normalizeTechnology(alias), entry, exactAliasKinds[alias] ?? 'alias');
  }
  return result;
}

function addAlias(target, alias, entry, matchedBy) {
  const existing = target.get(alias) ?? [];
  if (!existing.some((match) => match.entry.id === entry.id)) target.set(alias, [...existing, { entry, matchedBy }]);
}

function matchResult({ entry, matchedBy }) {
  return { ...entry, matchedBy };
}

function boundaryIndex(value, alias) {
  let offset = value.indexOf(alias);
  while (offset >= 0) {
    const before = offset === 0 ? '' : value[offset - 1];
    const afterOffset = offset + alias.length;
    const after = afterOffset === value.length ? '' : value[afterOffset];
    if (!isWord(before) && !isWord(after)) return offset;
    offset = value.indexOf(alias, offset + 1);
  }
  return -1;
}

function isWord(value) {
  return value !== '' && /[\p{L}\p{N}]/u.test(value);
}

function searchScore(id, compact, terms, normalized) {
  if (id === compact) return 0;
  if (id.startsWith(compact)) return 10 + id.length - compact.length;
  const alternate = terms.findIndex((term) => term === normalized || term.replace(/\s+/g, '') === compact);
  if (alternate >= 0) return 30 + alternate;
  const prefix = terms.findIndex((term) => term.startsWith(normalized));
  if (prefix >= 0) return 50 + prefix;
  const idOffset = id.indexOf(compact);
  if (idOffset >= 0) return 100 + idOffset;
  const contained = terms.findIndex((term) => term.includes(normalized));
  return contained < 0 ? Number.POSITIVE_INFINITY : 150 + contained;
}

function bucketFor(id) {
  const first = id[0]?.toLowerCase();
  return first !== undefined && first >= 'a' && first <= 'z' ? first : 'other';
}

function assetBucket(bucket) {
  switch (bucket) {
    case 'a': return import('./generated/assets/a.js');
    case 'b': return import('./generated/assets/b.js');
    case 'c': return import('./generated/assets/c.js');
    case 'd': return import('./generated/assets/d.js');
    case 'e': return import('./generated/assets/e.js');
    case 'f': return import('./generated/assets/f.js');
    case 'g': return import('./generated/assets/g.js');
    case 'h': return import('./generated/assets/h.js');
    case 'i': return import('./generated/assets/i.js');
    case 'j': return import('./generated/assets/j.js');
    case 'k': return import('./generated/assets/k.js');
    case 'l': return import('./generated/assets/l.js');
    case 'm': return import('./generated/assets/m.js');
    case 'n': return import('./generated/assets/n.js');
    case 'o': return import('./generated/assets/o.js');
    case 'p': return import('./generated/assets/p.js');
    case 'q': return import('./generated/assets/q.js');
    case 'r': return import('./generated/assets/r.js');
    case 's': return import('./generated/assets/s.js');
    case 't': return import('./generated/assets/t.js');
    case 'u': return import('./generated/assets/u.js');
    case 'v': return import('./generated/assets/v.js');
    case 'w': return import('./generated/assets/w.js');
    case 'x': return import('./generated/assets/x.js');
    case 'y': return import('./generated/assets/y.js');
    case 'z': return import('./generated/assets/z.js');
    default: return import('./generated/assets/other.js');
  }
}
