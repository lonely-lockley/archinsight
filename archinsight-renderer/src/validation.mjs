const defaultMaxRenderCount = 16;
const defaultMaxDotBytes = 1024 * 1024;
const defaultPngDpi = 200;
const defaultMaxPngDpi = 600;
const defaultMaxPngBytes = 16 * 1024 * 1024;

export function requestLimitsFromEnv(env = process.env) {
  return {
    maxRenderCount: positiveInteger(env.MAX_RENDER_COUNT, defaultMaxRenderCount),
    maxDotBytes: positiveInteger(env.MAX_DOT_BYTES, defaultMaxDotBytes),
    defaultPngDpi: positiveInteger(env.DEFAULT_PNG_DPI, defaultPngDpi),
    maxPngDpi: positiveInteger(env.MAX_PNG_DPI, defaultMaxPngDpi),
    maxPngBytes: positiveInteger(env.MAX_PNG_BYTES, defaultMaxPngBytes)
  };
}

export function validateSvgRenderPayload(payload, limits = requestLimitsFromEnv()) {
  return { renders: validateRenders(payload, limits) };
}

export function validatePngRenderPayload(payload, limits = requestLimitsFromEnv()) {
  return {
    renders: validateRenders(payload, limits),
    dpi: validateDpi(payload?.dpi, limits)
  };
}

export function validateRenderPayload(payload, limits = requestLimitsFromEnv()) {
  return validateSvgRenderPayload(payload, limits).renders;
}

function validateRenders(payload, limits) {
  const renders = payload?.renders;
  if (!Array.isArray(renders)) {
    throw new Error('renders must be an array');
  }
  if (renders.length > limits.maxRenderCount) {
    throw new Error(`too many renders: ${renders.length}`);
  }
  return renders.map((render, index) => validateRender(render, index, limits));
}

function validateRender(render, index, limits) {
  if (render === null || typeof render !== 'object') {
    throw new Error(`render ${index} must be an object`);
  }
  const sourceIdentity = requiredString(render.sourceIdentity, `render ${index} sourceIdentity`);
  const diagram = requiredString(render.diagram, `render ${index} diagram`);
  const dot = requiredString(render.dot, `render ${index} dot`);
  if (byteLength(dot) > limits.maxDotBytes) {
    throw new Error(`render ${index} DOT payload is too large`);
  }
  return { sourceIdentity, diagram, dot };
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateDpi(value, limits) {
  if (value === undefined || value === null) {
    return limits.defaultPngDpi;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('dpi must be a positive integer');
  }
  if (parsed > limits.maxPngDpi) {
    throw new Error(`dpi is too high: ${parsed}`);
  }
  return parsed;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}
