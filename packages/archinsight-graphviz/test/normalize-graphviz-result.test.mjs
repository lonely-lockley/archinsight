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

test('removes Graphviz native title tooltips from graphs, nodes, and edges', () => {
  const result = normalizeGraphvizSvgResult({
    status: 'success',
    output: '<svg><title>graph</title><g class="node"><title>shop/api</title></g><g class="edge"><title>api-&gt;db</title></g></svg>',
    errors: []
  });

  assert.deepEqual(result, {
    status: 'success',
    svg: '<svg><g class="node"></g><g class="edge"></g></svg>',
    warnings: []
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
