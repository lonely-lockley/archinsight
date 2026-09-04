<script lang="ts">
  import type { SourceLocation, StructureTreeNodeModel } from '@archinsight/workbench/types';

  export let node: StructureTreeNodeModel;
  export let depth = 0;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;

  let expanded = true;

  function toggle(): void {
    expanded = !expanded;
  }

  function openSource(): void {
    if (node.declaration !== undefined) {
      onOpenDeclaration(node.declaration);
    }
  }
</script>

<div
  class:clickable={node.declaration !== undefined || node.children.length > 0}
  class="structure-row"
  style={`--depth: ${depth}`}
>
  {#if node.children.length > 0}
    <button
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`}
      class="chevron"
      type="button"
      on:click={toggle}
    >
      {expanded ? '⌄' : '›'}
    </button>
  {:else}
    <span class="chevron-spacer"></span>
  {/if}
  <button
    class="node-content"
    disabled={node.declaration === undefined}
    type="button"
    on:click={openSource}
  >
    <span aria-hidden="true" class={`codicon codicon-${node.icon} icon`}></span>
    <span class="label">{node.label}</span>
    {#if node.meta !== undefined}
      <span class="meta">{node.meta}</span>
    {/if}
  </button>
</div>

{#if expanded && node.children.length > 0}
  {#each node.children as child (child.id)}
    <svelte:self node={child} depth={depth + 1} {onOpenDeclaration} />
  {/each}
{/if}

<style>
  .structure-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 10px 0 calc(10px + var(--depth) * 18px);
    background: transparent;
    color: #d2d2d2;
    user-select: none;
  }

  .structure-row.clickable {
    cursor: default;
  }

  .structure-row:hover {
    background: #2f2f2f;
  }

  .chevron,
  .chevron-spacer {
    width: 18px;
    height: 28px;
  }

  .chevron {
    padding: 0;
    border: 0;
    background: transparent;
    color: #9a9a9a;
    font: inherit;
    cursor: pointer;
  }

  .node-content {
    display: grid;
    grid-template-columns: 18px minmax(0, auto) minmax(0, 1fr);
    align-items: center;
    min-width: 0;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .node-content:disabled {
    opacity: 1;
  }

  .node-content:not(:disabled) {
    cursor: pointer;
  }

  .icon {
    font-size: 15px;
  }

  .codicon-symbol-class {
    color: var(--vscode-symbolIcon-classForeground, #EE9D28);
  }

  .codicon-symbol-variable {
    color: var(--vscode-symbolIcon-variableForeground, #75BEFF);
  }

  .codicon-symbol-namespace {
    color: var(--vscode-symbolIcon-namespaceForeground, #d2d2d2);
  }

  .codicon-symbol-operator {
    color: var(--vscode-symbolIcon-operatorForeground, #d2d2d2);
  }

  .codicon-symbol-reference {
    color: var(--vscode-symbolIcon-referenceForeground, #d2d2d2);
  }

  .label,
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label {
    min-width: 0;
  }

  .meta {
    padding-left: 8px;
    color: #858585;
    font-size: 12px;
  }
</style>
