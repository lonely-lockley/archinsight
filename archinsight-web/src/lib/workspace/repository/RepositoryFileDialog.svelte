<script lang="ts">
  import type { TreeNode } from '@archinsight/workbench/types';
  import { joinPath, normalizeDialogName } from './repository-paths';
  import type { FileDialogState } from './repository-dialog-types';

  export let dialog: FileDialogState;
  export let directories: readonly TreeNode[];
  export let onCancel: () => void;
  export let onSubmit: () => void;
  export let onDirectoryChange: (directory: string) => void;
  export let onFileNameChange: (fileName: string) => void;

  $: targetPath = joinPath(
    dialog.directory,
    normalizeDialogName(dialog.fileName, dialog.target)
  ) || '-';

  function handleFileNameInput(event: Event): void {
    onFileNameChange((event.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={onCancel}>
  <div
    class="file-dialog"
    role="dialog"
    aria-modal="true"
    aria-label={dialog.title}
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(event) => event.stopPropagation()}
  >
    <form on:submit|preventDefault={onSubmit}>
      <header>
        <h2>{dialog.title}</h2>
      </header>
      <div class="file-dialog-body">
        <div class="directory-picker" aria-label="Directories">
          {#each directories as directory (directory.path || '__root__')}
            <button
              type="button"
              class:active={dialog.directory === directory.path}
              style={`--depth: ${directory.path === '' ? 0 : directory.path.split('/').length}`}
              on:click={() => onDirectoryChange(directory.path)}
            >
              <span aria-hidden="true" class="codicon codicon-folder"></span>
              <span>{directory.path === '' ? directory.name : directory.path}</span>
            </button>
          {/each}
        </div>
        <label class="file-name-field">
          <span>Name</span>
          <input
            autocomplete="off"
            spellcheck="false"
            value={dialog.fileName}
            on:input={handleFileNameInput}
          />
        </label>
        <div class="target-preview">{targetPath}</div>
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

  .directory-picker {
    min-height: 180px;
    max-height: 280px;
    overflow: auto;
    border: 1px solid #3d3d3d;
    border-radius: 4px;
    background: #202020;
  }

  .directory-picker button {
    display: grid;
    grid-template-columns: 20px 1fr;
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 10px 0 calc(10px + var(--depth) * 16px);
    border: 0;
    background: transparent;
    color: #d8d8d8;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }

  .directory-picker button:hover,
  .directory-picker button:focus-visible {
    background: #2f2f2f;
    outline: none;
  }

  .directory-picker button.active {
    background: #36511f;
    color: #ffffff;
  }

  .file-name-field {
    display: grid;
    gap: 6px;
    color: #cfcfcf;
    font-size: 12px;
  }

  .file-name-field input {
    box-sizing: border-box;
    width: 100%;
    height: 32px;
    padding: 0 9px;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #1f1f1f;
    color: #ffffff;
    font: inherit;
  }

  .file-name-field input:focus {
    border-color: var(--color-primary);
    outline: none;
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
