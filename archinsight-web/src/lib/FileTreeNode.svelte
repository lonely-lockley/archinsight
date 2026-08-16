<script lang="ts">
  import type { FileTreeNode } from './api';
  import RepositoryFileIcon from './RepositoryFileIcon.svelte';

  export let node: FileTreeNode;
  export let depth = 0;
  export let activePath: string | undefined = undefined;
  export let errorPaths: Set<string> = new Set();
  export let onOpen: (path: string) => void;
  export let onContextMenu: (node: FileTreeNode, event: MouseEvent) => void = () => {};

  let expanded = true;
  function openOrToggle(): void {
    if (node.type === 'file') {
      onOpen(node.path);
      return;
    }
    expanded = !expanded;
  }
</script>

<button
  type="button"
  class:directory={node.type === 'directory'}
  class:file={node.type === 'file'}
  class:active={node.path === activePath}
  class:error-file={node.type === 'file' && errorPaths.has(node.path)}
  class="tree-row"
  style={`--depth: ${depth}`}
  on:click={() => node.type === 'directory' && (expanded = !expanded)}
  on:dblclick|stopPropagation={openOrToggle}
  on:contextmenu={(event) => onContextMenu(node, event)}
>
  <span class="chevron">{node.type === 'directory' ? (expanded ? '⌄' : '›') : ''}</span>
  <span class="icon-cell">
    <RepositoryFileIcon name={node.name} type={node.type} opened={expanded} />
  </span>
  <span class="name"><span class="name-text">{node.name}</span></span>
</button>

{#if node.type === 'directory' && expanded}
  {#each node.children as child (child.path || child.name)}
    <svelte:self node={child} depth={depth + 1} {activePath} {errorPaths} {onOpen} {onContextMenu} />
  {/each}
{/if}

<style>
  .tree-row {
    display: grid;
    grid-template-columns: 18px 20px 1fr;
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 10px 0 calc(10px + var(--depth) * 18px);
    border: 0;
    background: transparent;
    color: #d2d2d2;
    font: inherit;
    text-align: left;
    cursor: default;
    user-select: none;
  }

  .tree-row:hover {
    background: #2f2f2f;
  }

  .tree-row.active {
    background: #36511f;
    color: #ffffff;
  }

  .directory {
    font-weight: inherit;
  }

  .file {
    color: #d2d2d2;
  }

  .chevron {
    color: #9a9a9a;
  }

  .icon-cell {
    display: grid;
    place-items: center;
    justify-self: center;
    color: #b9b9b9;
  }

  .tree-row.active .icon-cell {
    color: currentColor;
  }

  .name {
    position: relative;
    display: inline-block;
    justify-self: start;
    max-width: 100%;
    overflow: visible;
  }

  .name-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-file .name::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 8px;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 4 C1 2 3 2 4 4 C5 6 7 6 8 4' fill='none' stroke='%23ff5c57' stroke-width='1.3'/%3E%3C/svg%3E");
    background-repeat: repeat-x;
    background-position: left center;
    background-size: 8px 8px;
  }
</style>
