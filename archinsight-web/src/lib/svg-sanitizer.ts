const allowedSvgElements = new Set([
  'a',
  'circle',
  'clippath',
  'defs',
  'desc',
  'ellipse',
  'g',
  'line',
  'lineargradient',
  'marker',
  'path',
  'polygon',
  'polyline',
  'rect',
  'stop',
  'svg',
  'text',
  'title',
  'tspan'
]);

const allowedSvgAttributes = new Set([
  'aria-label',
  'class',
  'clip-path',
  'cx',
  'cy',
  'd',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'href',
  'id',
  'marker-end',
  'marker-mid',
  'marker-start',
  'offset',
  'opacity',
  'points',
  'r',
  'role',
  'rx',
  'ry',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'transform',
  'viewbox',
  'width',
  'x',
  'x1',
  'x2',
  'xlink:href',
  'xmlns',
  'xmlns:xlink',
  'y',
  'y1',
  'y2'
]);

const urlAttributeNames = new Set(['href', 'xlink:href']);

export function sanitizeSvg(rawSvg: string | undefined): string | undefined {
  if (rawSvg === undefined) {
    return undefined;
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return '';
  }
  const document = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
  if (document.querySelector('parsererror') !== null || document.documentElement.nodeName !== 'svg') {
    return '';
  }
  sanitizeNode(document.documentElement);
  return new XMLSerializer().serializeToString(document.documentElement);
}

function sanitizeNode(node: Element): void {
  for (const child of Array.from(node.children)) {
    const tagName = child.tagName.split(':').at(-1)?.toLowerCase() ?? child.tagName.toLowerCase();
    if (!allowedSvgElements.has(tagName)) {
      child.remove();
      continue;
    }
    sanitizeAttributes(child);
    sanitizeNode(child);
  }
  sanitizeAttributes(node);
}

function sanitizeAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name;
    const normalizedName = name.toLowerCase();
    if (normalizedName.startsWith('on') || !allowedSvgAttributes.has(normalizedName)) {
      element.removeAttribute(name);
      continue;
    }
    if (urlAttributeNames.has(normalizedName) && !isAllowedSvgUrl(attribute.value)) {
      element.removeAttribute(name);
      continue;
    }
    if (containsExternalCssUrl(attribute.value)) {
      element.removeAttribute(name);
    }
  }
}

function isAllowedSvgUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('#') || trimmed.startsWith('insight://goto?');
}

function containsExternalCssUrl(value: string): boolean {
  return /url\s*\(/i.test(value) && !/url\s*\(\s*['"]?#/i.test(value);
}
