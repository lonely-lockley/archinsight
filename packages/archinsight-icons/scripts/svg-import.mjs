import { SaxesParser } from 'saxes';

const forbiddenElements = new Set(['script', 'image', 'foreignobject', 'text', 'style', 'link']);

export function normalizeSvg(input) {
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) return { error: 'DOCTYPE and entities are forbidden' };
  const ids = new Set();
  const references = new Set();
  const significantPaints = [];
  const features = { masks: false, clips: false, gradients: false };
  let rootSeen = false;
  let rootClosed = false;
  let rootViewBox;
  let rootDepth = 0;
  let parseError;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('error', (error) => { parseError = error.message; });
  parser.on('opentag', (node) => {
    const name = node.name.toLowerCase();
    rootDepth += 1;
    if (!rootSeen) {
      rootSeen = true;
      if (name !== 'svg') parseError = 'root element must be svg';
      rootViewBox = attributeValue(node.attributes, 'viewBox');
    } else if (rootClosed) {
      parseError = 'multiple root elements';
    }
    if (forbiddenElements.has(name)) parseError = 'forbidden active or external-capable element';
    if (name === 'lineargradient' || name === 'radialgradient') {
      features.gradients = true;
      parseError = 'gradient cannot be safely normalized';
    }
    if (name === 'mask') features.masks = true;
    if (name === 'clippath') features.clips = true;
    for (const [rawName, value] of Object.entries(node.attributes)) {
      const attribute = rawName.toLowerCase();
      const text = typeof value === 'string' ? value : value.value;
      if (attribute.startsWith('on')) parseError = 'event handler attribute';
      if (attribute === 'style') parseError = 'inline style cannot be safely normalized';
      if ((attribute === 'href' || attribute === 'xlink:href')) {
        if (!text.startsWith('#')) parseError = 'external reference';
        else references.add(text.slice(1));
      }
      if (attribute === 'id') {
        if (ids.has(text)) parseError = `duplicate local id '${text}'`;
        ids.add(text);
      }
      for (const match of text.matchAll(/url\(\s*["']?#([^)'"\s]+)["']?\s*\)/gi)) references.add(match[1]);
      if (/url\(/i.test(text) && !/^(?:url\(\s*["']?#[^)'"\s]+["']?\s*\))$/i.test(text.trim()) && (attribute === 'fill' || attribute === 'stroke' || attribute === 'filter' || attribute === 'mask' || attribute === 'clip-path')) {
        parseError = 'external paint reference';
      }
      if (attribute === 'fill' || attribute === 'stroke') {
        const paint = text.trim().toLowerCase();
        if (paint !== 'none' && paint !== 'currentcolor' && !/^url\(\s*["']?#[^)'"\s]+["']?\s*\)$/i.test(paint)) significantPaints.push(paint);
      }
    }
  });
  parser.on('closetag', () => {
    rootDepth -= 1;
    if (rootDepth === 0) rootClosed = true;
  });
  try {
    parser.write(input).close();
  } catch (error) {
    parseError ??= error instanceof Error ? error.message : String(error);
  }
  if (parseError !== undefined) return { error: `invalid or unsafe SVG: ${parseError}` };
  if (!rootSeen || !rootClosed) return { error: 'invalid SVG root' };
  if (rootViewBox === undefined || !validViewBox(rootViewBox)) return { error: 'missing or invalid viewBox' };
  const missingReference = [...references].find((id) => !ids.has(id));
  if (missingReference !== undefined) return { error: `missing local reference '#${missingReference}'` };
  if (new Set(significantPaints).size > 1) return { error: 'multiple fixed paints cannot be safely normalized' };

  const withoutPreamble = input.replace(/^\s*<\?xml[^>]*>\s*/i, '').replace(/<!--([\s\S]*?)-->/g, '').trim();
  const normalized = withoutPreamble
    .replace(/<svg\b([^>]*)>/i, (_match, attributes) => {
      const cleaned = attributes.replace(/\s(?:width|height|fill|color)\s*=\s*["'][^"']*["']/gi, '');
      return `<svg${cleaned} fill="currentColor" color="currentColor" aria-hidden="true" focusable="false">`;
    })
    .replace(/\b(fill|stroke)\s*=\s*(["'])(?!none\2|currentColor\2|url\(#)([^"']+)\2/gi, '$1=$2currentColor$2');
  return { svg: normalized.replace(/>\s+</g, '><'), features };
}

export function validViewBox(value) {
  const parts = value.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0;
}

function attributeValue(attributes, name) {
  const entry = Object.entries(attributes).find(([key]) => key.toLowerCase() === name.toLowerCase());
  if (entry === undefined) return undefined;
  return typeof entry[1] === 'string' ? entry[1] : entry[1].value;
}
