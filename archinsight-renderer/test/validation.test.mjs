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
    DEFAULT_PNG_DPI: '300',
    MAX_PNG_DPI: '900',
    MAX_PNG_BYTES: '123456'
  }), {
    maxRenderCount: 4,
    maxDotBytes: 2048,
    defaultPngDpi: 300,
    maxPngDpi: 900,
    maxPngBytes: 123456
  });
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
  assert.throws(() => validatePngRenderPayload({
    dpi: 0,
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 }), /dpi must be a positive integer/);
  assert.throws(() => validatePngRenderPayload({
    dpi: 601,
    renders: [{ sourceIdentity: 'app.ai', diagram: 'query', dot: 'digraph app { a -> b }' }]
  }, { maxRenderCount: 2, maxDotBytes: 1024, defaultPngDpi: 200, maxPngDpi: 600 }), /dpi is too high/);
});
