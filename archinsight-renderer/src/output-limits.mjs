const lengthPattern = /^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|in|cm|mm)?\s*$/iu;

export function validateSvgOutput(svg, limits) {
  const bytes = Buffer.byteLength(svg, 'utf8');
  if (bytes > limits.maxSvgBytes) {
    throw new Error(`SVG output is too large: ${bytes}`);
  }
  return bytes;
}

export function expectedPngDimensions(svg, dpi) {
  const tag = /<svg\b([^>]*)>/iu.exec(svg)?.[1];
  if (!tag) {
    throw new Error('SVG output does not contain a root element');
  }
  const viewBox = attribute(tag, 'viewBox')?.trim().split(/[\s,]+/u).map(Number);
  const viewBoxWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : undefined;
  const viewBoxHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : undefined;
  const width = svgLengthPixels(attribute(tag, 'width'), dpi) ?? viewBoxWidth;
  const height = svgLengthPixels(attribute(tag, 'height'), dpi) ?? viewBoxHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG output dimensions cannot be determined safely');
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export function validatePngDimensions(width, height, limits) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('PNG dimensions are invalid');
  }
  if (width > limits.maxPngWidth || height > limits.maxPngHeight) {
    throw new Error(`PNG dimensions are too large: ${width} x ${height}`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > limits.maxPngPixels) {
    throw new Error(`PNG pixel count is too large: ${pixels}`);
  }
}

export function addOutputBytes(total, added, limits) {
  const next = total + added;
  if (!Number.isSafeInteger(next) || next > limits.maxTotalOutputBytes) {
    throw new Error(`aggregate render output is too large: ${next}`);
  }
  return next;
}

function attribute(tag, name) {
  const expression = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu');
  const match = expression.exec(tag);
  return match?.[1] ?? match?.[2];
}

function svgLengthPixels(value, dpi) {
  if (value == null) {
    return undefined;
  }
  const match = lengthPattern.exec(value);
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  switch ((match[2] ?? 'px').toLowerCase()) {
    case 'pt': return amount * dpi / 72;
    case 'in': return amount * dpi;
    case 'cm': return amount * dpi / 2.54;
    case 'mm': return amount * dpi / 25.4;
    default: return amount;
  }
}
