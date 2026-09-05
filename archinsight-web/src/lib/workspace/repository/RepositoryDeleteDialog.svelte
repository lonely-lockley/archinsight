<script lang="ts">
  import type { DeleteDialogState } from './repository-dialog-types';

  export let dialog: DeleteDialogState;
  export let onCancel: () => void;
  export let onSubmit: () => void;
</script>

<div class="modal-backdrop" role="presentation" on:click={onCancel}>
  <div
    class="file-dialog confirm-dialog"
    role="dialog"
    aria-modal="true"
    aria-label={dialog.target === 'folder' ? 'Delete folder' : 'Delete file'}
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(event) => event.stopPropagation()}
  >
    <form on:submit|preventDefault={onSubmit}>
      <header>
        <h2>{dialog.target === 'folder' ? 'Delete folder' : 'Delete file'}</h2>
      </header>
      <div class="file-dialog-body confirm-dialog-body">
        <p>
          {dialog.target === 'folder'
            ? 'Are you sure you want to delete this folder and all files inside it?'
            : 'Are you sure you want to delete this file?'}
        </p>
        <div class="target-preview">{dialog.path}</div>
        {#if dialog.error !== undefined}
          <div class="dialog-error">{dialog.error}</div>
        {/if}
      </div>
      <footer>
        <button type="button" on:click={onCancel}>Cancel</button>
        <button type="submit">OK</button>
      </footer>
    </form>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 38%);
    -webkit-backdrop-filter: blur(5px);
    backdrop-filter: blur(5px);
  }

  .file-dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: min(620px, calc(100vh - 32px));
    border: 1px solid #474747;
    border-radius: 6px;
    background: #252525;
    color: #eeeeee;
    box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
  }

  .confirm-dialog {
    width: min(420px, calc(100vw - 32px));
  }

  form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: inherit;
  }

  header {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-bottom: 1px solid #3a3a3a;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .file-dialog-body {
    display: grid;
    gap: 12px;
    min-height: 0;
    padding: 12px 16px;
  }

  .confirm-dialog-body p {
    margin: 0;
    color: #d8d8d8;
    font-size: 13px;
    line-height: 1.4;
  }

  .target-preview {
    overflow: hidden;
    color: #a8a8a8;
    font-family: "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-error {
    color: #ff8787;
    font-size: 12px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #3a3a3a;
  }

  footer button {
    min-width: 76px;
    min-height: 32px;
    height: 30px;
    padding: 0 14px;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #2b2b2b;
    color: #eeeeee;
    font: inherit;
    font-size: 12px;
  }

  footer button:hover,
  footer button:focus-visible {
    border-color: #5a5a5a;
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  footer button[type="submit"] {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: #121212;
  }

  footer button[type="submit"]:hover,
  footer button[type="submit"]:focus-visible {
    border-color: #4be08a;
    background: #4be08a;
    color: #101010;
  }
</style>
