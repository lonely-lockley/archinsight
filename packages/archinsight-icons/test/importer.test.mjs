import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSvg, validViewBox } from '../scripts/svg-import.mjs';

test('normalizes a deterministic self-contained monochrome SVG', () => {
  const source = '<?xml version="1.0"?><svg width="20" height="20" viewBox="0 0 20 20"><path fill="#123" d="M0 0h20v20z"/></svg>';
  const first = normalizeSvg(source);
  const second = normalizeSvg(source);
  assert.deepEqual(first, second);
  assert.match(first.svg, /^<svg viewBox="0 0 20 20" fill="currentColor"/);
  assert.doesNotMatch(first.svg, /width=|height=|#123/);
  assert.deepEqual(first.features, { masks: false, clips: false, gradients: false });
});

test('rejects malformed, active, external, ambiguous, and dangling SVG content', () => {
  const invalid = [
    '<svg viewBox="0 0 10 10"><path></svg>',
    '<svg viewBox="0 0 10 10"><script/></svg>',
    '<svg viewBox="0 0 10 10"><use href="https://example.test/icon"/></svg>',
    '<svg viewBox="0 0 10 10"><path fill="#000"/><path fill="#fff"/></svg>',
    '<svg viewBox="0 0 10 10"><use href="#missing"/></svg>',
    '<!DOCTYPE svg><svg viewBox="0 0 10 10"/>',
  ];
  for (const source of invalid) assert.equal(typeof normalizeSvg(source).error, 'string', source);
});

test('accepts valid local references and reports structural features', () => {
  const result = normalizeSvg('<svg viewBox="0 0 10 10"><defs><path id="shape" d="M0 0h1v1z"/></defs><clipPath id="clip"><use href="#shape"/></clipPath><g clip-path="url(#clip)"><use href="#shape"/></g></svg>');
  assert.equal(result.error, undefined);
  assert.equal(result.features.clips, true);
  assert.equal(result.features.masks, false);
  assert.equal(validViewBox('0 0 10 10'), true);
  assert.equal(validViewBox('0 0 0 10'), false);
});
