import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRAPHVIZ_RENDER_FAILED,
  normalizeGraphvizSvgResult
} from '../src/index.js';

test('normalizes successful SVG output and preserves ordered warning messages', () => {
  assert.deepEqual(normalizeGraphvizSvgResult({
    status: 'success',
    output: '<svg/>',
    errors: [
      { level: 'warning', message: 'first warning' },
      { message: '' },
      { level: 'warning', message: 'second warning' }
    ]
  }), {
    status: 'success',
    svg: '<svg/>',
    warnings: ['first warning', '', 'second warning']
  });
});

test('joins non-empty failure messages in their original order', () => {
  assert.deepEqual(normalizeGraphvizSvgResult({
    status: 'failure',
    output: undefined,
    errors: [
      { level: 'error', message: 'syntax error' },
      { message: '' },
      { level: 'error', message: 'unexpected end' }
    ]
  }), {
    status: 'failure',
    error: 'syntax error\nunexpected end'
  });
});

test('uses a stable fallback when Graphviz supplies no useful failure message', () => {
  assert.deepEqual(normalizeGraphvizSvgResult({
    status: 'failure',
    output: undefined,
    errors: [{ message: '' }]
  }), {
    status: 'failure',
    error: GRAPHVIZ_RENDER_FAILED
  });
});
