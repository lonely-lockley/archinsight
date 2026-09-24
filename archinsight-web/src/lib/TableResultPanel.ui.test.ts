// @vitest-environment happy-dom

import TableResultPanel from '@archinsight/workbench/table-result-panel';
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';

describe('TableResultPanel', () => {
  it('renders typed columns, null, complex values, and row metadata safely', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(TableResultPanel, { target, props: { result: {
      schemaVersion: 'aiq-table.v1',
      kind: 'table',
      columns: [
        { name: 'service', type: 'string', nullable: false },
        { name: 'evidence', type: 'list', nullable: true, itemType: 'record' }
      ],
      rows: [['shop/api', [{ direction: 'forward', text: '<script>bad()</script>' }]], ['shop/worker', null]],
      metadata: {
        context: 'shop', source: null, executionComplete: true, rowCount: 2, skip: 0, limit: null,
        pathScopes: [{ operation: 'shortest', min: 1, max: null, direction: 'outgoing', relationshipType: 'REFERENCES' }],
        warnings: ['AI100: linked model warning']
      }
    } } });
    expect(target.textContent).toContain('2 rows');
    expect(target.textContent).toContain('service');
    expect(target.querySelector('.null')?.textContent).toBe('null');
    expect(target.querySelector('script')).toBeNull();
    expect(target.querySelector('details pre')?.textContent).toContain('<script>bad()</script>');
    expect(target.textContent).not.toContain('Query scope and warnings');
    expect(target.textContent).not.toContain('shortest 1..unbounded, outgoing, REFERENCES');
    expect(target.textContent).not.toContain('AI100: linked model warning');
    expect(target.querySelector('header button')).toBeNull();
    expect(target.querySelector('footer .result-metadata')?.textContent).toContain('2 rows');
    const first = target.querySelector<HTMLElement>('td[data-row="0"][data-column="0"]')!;
    const second = target.querySelector<HTMLElement>('td[data-row="0"][data-column="1"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(second);
    await unmount(component);
    target.remove();
  });

  it('paginates large local results without changing row order', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const rows = Array.from({ length: 101 }, (_, index) => [`row-${index}`]);
    const component = mount(TableResultPanel, { target, props: { result: {
      schemaVersion: 'aiq-table.v1', kind: 'table',
      columns: [{ name: 'id', type: 'string', nullable: false }], rows,
      metadata: { context: null, source: null, executionComplete: true, rowCount: rows.length, skip: 0, limit: null, pathScopes: [], warnings: [] }
    } } });
    expect(target.textContent).toContain('Page 1 of 2');
    expect(target.textContent).toContain('row-99');
    expect(target.textContent).not.toContain('row-100');
    target.querySelectorAll<HTMLButtonElement>('footer button')[1]?.click();
    await tick();
    expect(target.textContent).toContain('row-100');
    expect(target.textContent).not.toContain('row-99');
    await unmount(component);
    target.remove();
  });

  it('distinguishes an empty table body from the row count', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(TableResultPanel, { target, props: { result: {
      schemaVersion: 'aiq-table.v1', kind: 'table',
      columns: [{ name: 'id', type: 'string', nullable: false }], rows: [],
      metadata: { context: null, source: null, executionComplete: true, rowCount: 0, skip: 0, limit: null, pathScopes: [], warnings: [] }
    } } });
    expect(target.querySelector('.empty')?.textContent).toBe('No data');
    expect(target.querySelector('footer .result-metadata')?.textContent).toContain('0 rows');
    await unmount(component);
    target.remove();
  });
});
