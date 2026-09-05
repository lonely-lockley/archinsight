import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completionDetail,
  completionDisplayLabel,
  completionDocumentationMarkdown,
  completionSortBucket,
  completionSortText,
  diagnosticIdentity,
  filterTreeByQuery,
  semanticTokenModifierBits
} from '../src/index.js';

test('completion metadata has one stable ordering and imported detail policy', () => {
  const kinds = ['KEYWORD', 'CONSTRUCTOR', 'OPERATOR', 'ATTRIBUTE', 'IDENTIFIER', 'ENUM_VALUE', 'TYPE', 'ANNOTATION', 'NEWLINE'];
  assert.deepEqual(kinds.map(completionSortBucket), ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(completionSortText({ kind: 'TYPE', label: 'System' }), '6:System');
  assert.equal(completionDetail({ kind: 'IDENTIFIER', imported: true }), 'imported identifier');
  assert.equal(completionDetail({ kind: 'IDENTIFIER' }), 'IDENTIFIER');
  assert.deepEqual(completionDisplayLabel({ kind: 'IDENTIFIER', label: 'backend' }), {
    label: 'backend',
    description: 'IDENTIFIER'
  });
});

test('completion documentation renders presentation text as escaped markdown', () => {
  assert.equal(completionDocumentationMarkdown(undefined), undefined);
  assert.equal(completionDocumentationMarkdown({}), undefined);
  assert.equal(completionDocumentationMarkdown({
    header: 'Payments *API*',
    subtitle: 'HTTP [public]',
    body: 'Accepts #payments\nand > redirects.'
  }), [
    '**Payments \\*API\\***',
    'HTTP \\[public\\]',
    'Accepts \\#payments  \nand \\> redirects\\.'
  ].join('\n\n'));
});

test('completion documentation renders type ancestry and compatible constructors', () => {
  assert.equal(completionDocumentationMarkdown({
    header: 'Application',
    type: {
      abstract: true,
      baseType: 'SystemElement',
      constructors: [
        { spelling: 'service', ownerType: 'ServiceApplication' },
        { spelling: 'worker', ownerType: 'WorkerApplication' }
      ]
    }
  }), [
    '**Application**',
    '_Abstract type · extends `SystemElement`_',
    '**Available constructors**',
    '- `service` → `ServiceApplication`\n- `worker` → `WorkerApplication`'
  ].join('\n\n'));

  assert.equal(completionDocumentationMarkdown({
    type: { abstract: false, constructors: [] }
  }), [
    '_Type_',
    '**Available constructors**',
    'No compatible constructors.'
  ].join('\n\n'));
});

test('semantic modifier bits follow vocabulary order and ignore unknown modifiers', () => {
  const vocabulary = ['declaration', 'readonly', 'deprecated'];
  assert.equal(semanticTokenModifierBits(undefined, vocabulary), 0);
  assert.equal(semanticTokenModifierBits(['deprecated', 'unknown', 'declaration'], vocabulary), 5);
});

test('tree filtering preserves matches and only the ancestry of descendant matches', () => {
  const matching = { label: 'Payments API', children: [{ label: 'Hidden child', children: [] }] };
  const nested = { label: 'Platform', children: [{ label: 'Billing worker', children: [] }] };
  const omitted = { label: 'Website', children: [] };
  const nodes = [matching, nested, omitted];
  const searchText = (node) => node.label;

  assert.deepEqual(filterTreeByQuery(nodes, '  ', searchText), nodes);
  assert.deepEqual(filterTreeByQuery(nodes, 'PAYMENTS', searchText), [matching]);
  assert.deepEqual(filterTreeByQuery(nodes, 'billing', searchText), [{
    label: 'Platform',
    children: [{ label: 'Billing worker', children: [] }]
  }]);
  assert.deepEqual(filterTreeByQuery(nodes, 'missing', searchText), []);
});

test('diagnostic identity includes every meaningful position and message field', () => {
  const complete = {
    source: 'model.ai',
    level: 'ERROR',
    code: 'E1',
    message: 'broken',
    line: 2,
    column: 3,
    endLine: 4,
    endColumn: 5
  };
  assert.notEqual(diagnosticIdentity(complete), diagnosticIdentity({ ...complete, endColumn: 6 }));
  assert.equal(diagnosticIdentity({ source: 'model.ai', code: 'E1', message: 'broken' }), 'model.ai\u0000\u0000E1\u0000broken\u0000\u0000\u0000\u0000');
});
