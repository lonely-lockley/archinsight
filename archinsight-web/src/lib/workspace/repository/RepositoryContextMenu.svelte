<script lang="ts">
  import type { ControlState } from '$lib/actions/action-model';
  import type { TreeNode } from '@archinsight/workbench/types';

  type RepositoryContextMenuState = {
    node: TreeNode;
    x: number;
    y: number;
  };

  type RepositoryContextMenuActions = {
    createFile: ControlState;
    createFolder: ControlState;
    renameFile: ControlState;
    renameFolder: ControlState;
    deleteFile: ControlState;
    deleteFolder: ControlState;
  };

  export let menu: RepositoryContextMenuState;
  export let actions: RepositoryContextMenuActions;
  export let onClose: () => void;
  export let onNewFile: (directory: string) => void;
  export let onNewFolder: (directory: string) => void;
  export let onRenameFile: (path: string) => void;
  export let onRenameFolder: (path: string) => void;
  export let onDeleteFile: (path: string) => void;
  export let onDeleteFolder: (path: string) => void;
</script>

<div
  class="context-menu"
  style={`left: ${menu.x}px; top: ${menu.y}px;`}
  role="menu"
  tabindex="0"
  on:click|stopPropagation
  on:keydown={(event) => event.key === 'Escape' && onClose()}
  on:contextmenu|preventDefault
>
  {#if menu.node.type === 'directory'}
    {#if !actions.createFile.hidden}
      <button type="button" role="menuitem" disabled={actions.createFile.disabled} title={actions.createFile.reason} on:click={() => onNewFile(menu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-new-file"></span>
        <span>New file</span>
      </button>
    {/if}
    {#if !actions.createFolder.hidden}
      <button type="button" role="menuitem" disabled={actions.createFolder.disabled} title={actions.createFolder.reason} on:click={() => onNewFolder(menu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-new-folder"></span>
        <span>New folder</span>
      </button>
    {/if}
    {#if menu.node.path !== ''}
      {#if !actions.renameFolder.hidden}
        <button type="button" role="menuitem" disabled={actions.renameFolder.disabled} title={actions.renameFolder.reason} on:click={() => onRenameFolder(menu.node.path)}>
          <span aria-hidden="true" class="codicon codicon-edit"></span>
          <span>Rename / Move</span>
        </button>
      {/if}
      {#if !actions.deleteFolder.hidden}
        <button type="button" role="menuitem" disabled={actions.deleteFolder.disabled} title={actions.deleteFolder.reason} on:click={() => onDeleteFolder(menu.node.path)}>
          <span aria-hidden="true" class="codicon codicon-trash"></span>
          <span>Delete</span>
        </button>
      {/if}
    {/if}
  {:else}
    {#if !actions.renameFile.hidden}
      <button type="button" role="menuitem" disabled={actions.renameFile.disabled} title={actions.renameFile.reason} on:click={() => onRenameFile(menu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-edit"></span>
        <span>Rename / Move</span>
      </button>
    {/if}
    {#if !actions.deleteFile.hidden}
      <button type="button" role="menuitem" disabled={actions.deleteFile.disabled} title={actions.deleteFile.reason} on:click={() => onDeleteFile(menu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-trash"></span>
        <span>Delete</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 80;
    min-width: 172px;
    padding: 4px;
    border: 1px solid #454545;
    border-radius: 4px;
    background: #252525;
    box-shadow: 0 12px 28px rgb(0 0 0 / 34%);
  }

  .context-menu button {
    display: grid;
    grid-template-columns: 20px 1fr;
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #e5e5e5;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }

  .context-menu button:hover,
  .context-menu button:focus-visible {
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  .context-menu button:disabled {
    background: transparent;
    color: #707070;
    cursor: not-allowed;
  }
</style>
