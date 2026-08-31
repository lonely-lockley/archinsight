import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestLimitsFromEnv,
  validatePngRenderPayload,
  validateRenderPayload,
  validateSvgRenderPayload
} from '../src/validation.mjs';

test('validates and normalizes render payload', () => {
  const payload = validateSvgRenderPayload({
    renders: [{
      sourceIdentity: 'app.ai',
      diagram: 'query',
      dot: 'digraph app { a -> b }'
    }]
  }, { maxRenderCount: 2, maxDotBytes: 1024 });

  assert.deepEqual(payload.renders, [{
    sourceIdentity: 'app.ai',
    diagram: 'query',
    dot: 'digraph app { a -> b }'
  }]);
  assert.deepEqual(validateRenderPayload({ renders: payload.renders }, { maxRenderCount: 2, maxDotBytes: 1024 }), payload.renders);
});

test('rejects arbitrary malformed payloads', () => {
  assert.throws(() => validateRenderPayload({}, { maxRenderCount: 2, maxDotBytes: 1024 }), /renders must be an array/);
  assert.throws(() => validateRenderPayload({ renders: [null] }, { maxRenderCount: 2, maxDotBytes: 1024 }), /must be an object/);
  assert.throws(() => validateRenderPayload({
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: '' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024 }), /dot is required/);
  assert.throws(() => validateRenderPayload({
    renders: [{ sourceIdentity: '', diagram: 'query', dot: 'digraph app {}' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024 }), /sourceIdentity is required/);
  assert.throws(() => validateRenderPayload({
    renders: [{ sourceIdentity: 'app.ai', diagram: 42, dot: 'digraph app {}' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024 }), /diagram is required/);
});

test('enforces count and DOT byte limits', () => {
  assert.throws(() => validateRenderPayload({
    renders: [
      { sourceIdentity: 'one.ai', diagram: 'query', dot: 'digraph one {}' },
      { sourceIdentity: 'two.ai', diagram: 'query', dot: 'digraph two {}' }
    ]
  }, { maxRenderCount: 1, maxDotBytes: 1024 }), /too many renders/);

  assert.throws(() => validateRenderPayload({
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: '123456' }]
  }, { maxRenderCount: 2, maxDotBytes: 5 }), /DOT payload is too large/);
});

test('reads positive integer limits from environment', () => {
  assert.deepEqual(requestLimitsFromEnv({
    MAX_RENDER_COUNT: '4',
    MAX_DOT_BYTES: '2048',
    MAX_TOTAL_DOT_BYTES: '4096',
    DEFAULT_PNG_DPI: '300',
    MAX_PNG_DPI: '900',
    MAX_PNG_BYTES: '123456',
    MAX_PNG_WIDTH: '4000',
    MAX_PNG_HEIGHT: '3000',
    MAX_PNG_PIXELS: '12000000',
    MAX_SVG_BYTES: '500000',
    MAX_TOTAL_OUTPUT_BYTES: '700000',
    MAX_RESPONSE_BYTES: '900000',
    MAX_WARNING_BYTES: '10000'
  }), {
    maxRenderCount: 4,
    maxDotBytes: 2048,
    maxTotalDotBytes: 4096,
    defaultPngDpi: 300,
    maxPngDpi: 900,
    maxPngBytes: 123456,
    maxPngWidth: 4000,
    maxPngHeight: 3000,
    maxPngPixels: 12000000,
    maxSvgBytes: 500000,
    maxTotalOutputBytes: 700000,
    maxResponseBytes: 900000,
    maxWarningBytes: 10000
  });
});

test('uses safe defaults for missing and invalid environment limits', () => {
  const defaults = requestLimitsFromEnv({});
  const invalid = requestLimitsFromEnv({
    MAX_RENDER_COUNT: '0',
    MAX_DOT_BYTES: '-1',
    DEFAULT_PNG_DPI: '1.5',
    MAX_PNG_BYTES: 'not-a-number'
  });

  assert.equal(invalid.maxRenderCount, defaults.maxRenderCount);
  assert.equal(invalid.maxDotBytes, defaults.maxDotBytes);
  assert.equal(invalid.defaultPngDpi, defaults.defaultPngDpi);
  assert.equal(invalid.maxPngBytes, defaults.maxPngBytes);
});

test('enforces aggregate DOT bytes', () => {
  assert.throws(() => validateRenderPayload({
    renders: [
      { sourceIdentity: 'one.ai', diagram: 'query', dot: '12345' },
      { sourceIdentity: 'two.ai', diagram: 'query', dot: '67890' }
    ]
  }, { maxRenderCount: 2, maxDotBytes: 10, maxTotalDotBytes: 9 }), /total DOT payload is too large/);
});

test('validates png dpi with default and maximum', () => {
  const defaulted = validatePngRenderPayload({
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 });

  assert.equal(defaulted.dpi, 200);

  const explicit = validatePngRenderPayload({
    dpi: 300,
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 });

  assert.equal(explicit.dpi, 300);
  assert.equal(validatePngRenderPayload({
    dpi: '400',
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 }).dpi, 400);
  assert.throws(() => validatePngRenderPayload({
    dpi: 0,
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 }), /dpi must be a positive integer/);
  assert.throws(() => validatePngRenderPayload({
    dpi: 601,
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 }), /dpi is too high/);
});
