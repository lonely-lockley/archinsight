<script lang="ts">
  import { queryCellText, type QueryCell, type QueryTableResult } from '@insight/language';

  export let result: QueryTableResult;

  const pageSize = 100;
  let page = 0;
  $: pageCount = Math.max(1, Math.ceil(result.rows.length / pageSize));
  $: if (page >= pageCount) page = pageCount - 1;
  $: visibleRows = result.rows.slice(page * pageSize, (page + 1) * pageSize);

  function complex(cell: QueryCell): boolean {
    return typeof cell === 'object' && cell !== null;
  }

  function moveCell(event: KeyboardEvent, row: number, column: number): void {
    const offsets: Readonly<Record<string, readonly [number, number]>> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    const targetRow = row + offset[0];
    const targetColumn = column + offset[1];
    const table = (event.currentTarget as HTMLElement).closest('table');
    const target = table?.querySelector<HTMLElement>(`td[data-row="${targetRow}"][data-column="${targetColumn}"]`);
    if (target !== null && target !== undefined) {
      event.preventDefault();
      target.focus();
    }
  }

</script>

<section class="table-result" aria-label="Query table result">
  <div class="table-scroll" role="region" aria-label="Scrollable query results">
    <table>
      <thead>
        <tr>
          {#each result.columns as column (column.name)}
            <th scope="col">
              <span>{column.name}</span>
              <small>{column.type}{column.nullable ? '?' : ''}</small>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row, rowIndex (`${page}:${rowIndex}`)}
          <tr>
            {#each row as cell, columnIndex (columnIndex)}
              <td
                tabindex="0"
                class:null-value={cell === null}
                data-row={rowIndex}
                data-column={columnIndex}
                on:keydown={(event) => moveCell(event, rowIndex, columnIndex)}
              >
                {#if cell === null}
                  <span class="null">null</span>
                {:else if complex(cell)}
                  <details>
                    <summary>{Array.isArray(cell) ? `${cell.length} items` : String(cell.kind ?? 'record')}</summary>
                    <pre>{JSON.stringify(cell, null, 2)}</pre>
                  </details>
                {:else}
                  {queryCellText(cell)}
                {/if}
              </td>
            {/each}
          </tr>
        {:else}
          <tr><td class="empty" colspan={Math.max(1, result.columns.length)}>No data</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <footer>
    <div class="result-metadata">
      <span>{result.metadata.rowCount} {result.metadata.rowCount === 1 ? 'row' : 'rows'}</span>
      {#if result.metadata.limit !== null}<span>limit {result.metadata.limit}</span>{/if}
      {#if result.metadata.skip > 0}<span>skip {result.metadata.skip}</span>{/if}
    </div>
    {#if pageCount > 1}
      <div class="pagination">
      <button disabled={page === 0} type="button" on:click={() => page -= 1}>Previous</button>
      <span>Page {page + 1} of {pageCount}</span>
      <button disabled={page + 1 === pageCount} type="button" on:click={() => page += 1}>Next</button>
      </div>
    {/if}
  </footer>
</section>

<style>
  .table-result { display: grid; grid-template-rows: minmax(0, 1fr) auto; width: 100%; height: 100%; min-width: 0; min-height: 0; background: var(--archinsight-panel-bg, #1e1e1e); color: var(--archinsight-foreground, #ddd); }
  footer { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; min-height: 30px; gap: 12px; padding: 4px 12px; border-top: 1px solid var(--archinsight-border, #3c3c3c); font-size: 12px; }
  .result-metadata, .pagination { display: flex; align-items: center; gap: 12px; }
  .pagination { grid-column: 2; }
  button { color: inherit; background: var(--archinsight-control-bg, #333); border: 1px solid var(--archinsight-border-strong, #555); border-radius: 3px; padding: 4px 8px; }
  button:disabled { opacity: .45; }
  .table-scroll { min-width: 0; min-height: 0; overflow: auto; }
  table { width: max-content; min-width: 100%; border-collapse: collapse; font: 12px/1.4 var(--monaco-monospace-font, monospace); }
  th, td { max-width: 420px; padding: 7px 10px; border-right: 1px solid var(--archinsight-border, #3c3c3c); border-bottom: 1px solid var(--archinsight-border, #333); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { position: sticky; top: 0; z-index: 1; background: var(--archinsight-toolbar-bg, #252526); }
  th small { display: block; opacity: .65; font-weight: 400; }
  tbody tr:nth-child(even) { background: color-mix(in srgb, currentColor 3%, transparent); }
  td:focus { outline: 2px solid var(--archinsight-focus, #007fd4); outline-offset: -2px; }
  .null { opacity: .55; font-style: italic; }
  details summary { cursor: pointer; }
  pre { margin: 6px 0 0; white-space: pre-wrap; }
  .empty { padding: 32px; text-align: center; opacity: .7; }
</style>
