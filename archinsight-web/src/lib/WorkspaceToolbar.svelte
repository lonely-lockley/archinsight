<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ControlState } from './actions/action-model';

  export let onNewFile: () => void;
  export let onSave: () => void;
  export let onDownloadSource: () => void;
  export let onDownloadSvg: () => void;
  export let onDownloadPng: () => void;
  export let onDownloadDot: () => void;
  export let onDownloadCsv: () => void;
  export let onDownloadJson: () => void;
  export let canDownloadSvg = false;
  export let canDownloadPng = false;
  export let canDownloadDot = false;
  export let tableResult = false;
  export let newFileState: ControlState = { hidden: false, disabled: false };
  export let saveState: ControlState = { hidden: false, disabled: false };
  export let unsavedDocumentKind: 'model' | 'query' | undefined = undefined;
  export let onSelectDocumentKind: (kind: 'model' | 'query') => void = () => {};

  let downloadOpen = false;

  function toggleDownloadMenu(event: MouseEvent): void {
    event.stopPropagation();
    downloadOpen = !downloadOpen;
    if (downloadOpen) {
      window.addEventListener('click', closeDownloadMenu);
      window.addEventListener('keydown', closeDownloadMenuOnEscape);
    } else {
      removeDownloadMenuListeners();
    }
  }

  function closeDownloadMenu(): void {
    downloadOpen = false;
    removeDownloadMenuListeners();
  }

  function closeDownloadMenuOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeDownloadMenu();
    }
  }

  function download(handler: () => void): void {
    handler();
    closeDownloadMenu();
  }

  function removeDownloadMenuListeners(): void {
    window.removeEventListener('click', closeDownloadMenu);
    window.removeEventListener('keydown', closeDownloadMenuOnEscape);
  }

  onDestroy(removeDownloadMenuListeners);
</script>

<div class="workspace-toolbar">
  <div class="file-actions" aria-label="File actions">
    {#if !newFileState.hidden}
      <button aria-label="New" class="icon-button has-tooltip" data-tooltip={newFileState.reason ?? 'New'} disabled={newFileState.disabled} type="button" on:click={onNewFile}>
        <span aria-hidden="true" class="codicon codicon-new-file"></span>
      </button>
    {/if}
    {#if !saveState.hidden}
      <button aria-label="Save" class="icon-button has-tooltip" data-tooltip={saveState.reason ?? 'Save'} disabled={saveState.disabled} type="button" on:click={onSave}>
        <span aria-hidden="true" class="codicon codicon-save"></span>
      </button>
    {/if}
    <div class="download-action">
      <button aria-expanded={downloadOpen} aria-haspopup="menu" aria-label="Download" class="icon-button has-tooltip" data-tooltip="Download" type="button" on:click={toggleDownloadMenu}>
        <span aria-hidden="true" class="codicon codicon-cloud-download"></span>
      </button>
      {#if downloadOpen}
        <div class="download-menu" role="menu" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
          {#if tableResult}
            <button role="menuitem" type="button" on:click={() => download(onDownloadCsv)}>download table as CSV</button>
            <button role="menuitem" type="button" on:click={() => download(onDownloadJson)}>download table as JSON</button>
          {:else}
            <button role="menuitem" type="button" on:click={() => download(onDownloadSource)}>download source</button>
            <button disabled={!canDownloadSvg} role="menuitem" type="button" on:click={() => download(onDownloadSvg)}>download diagram as svg</button>
            <button disabled={!canDownloadPng} role="menuitem" type="button" on:click={() => download(onDownloadPng)}>download diagram as png</button>
            <button disabled={!canDownloadDot} role="menuitem" type="button" on:click={() => download(onDownloadDot)}>download diagram as DOT</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if unsavedDocumentKind !== undefined}
    <div class="document-kind-switch" role="group" aria-label="Document type">
      <button
        aria-label="Model (.ai)"
        aria-pressed={unsavedDocumentKind === 'model'}
        class:active={unsavedDocumentKind === 'model'}
        class="has-tooltip"
        data-tooltip="Model (.ai)"
        type="button"
        on:click={() => onSelectDocumentKind('model')}
      >
        <span aria-hidden="true" class="codicon codicon-type-hierarchy"></span>
      </button>
      <button
        aria-label="Query (.aiq)"
        aria-pressed={unsavedDocumentKind === 'query'}
        class:active={unsavedDocumentKind === 'query'}
        class="has-tooltip"
        data-tooltip="Query (.aiq)"
        type="button"
        on:click={() => onSelectDocumentKind('query')}
      >
        <span aria-hidden="true" class="codicon codicon-filter-filled"></span>
      </button>
    </div>
  {/if}
</div>

<style>
  .workspace-toolbar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .file-actions {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    height: 28px;
    border: 1px solid var(--archinsight-border, #3a3a3a);
    border-radius: 4px;
    background: var(--archinsight-control-group-bg, #202020);
  }

  .file-actions > button,
  .download-action > button {
    border-radius: 0;
  }

  .file-actions > button + button,
  .download-action {
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .file-actions > button:first-child {
    border-radius: 3px 0 0 3px;
  }

  .download-action > button {
    border-radius: 0 3px 3px 0;
  }

  .download-action {
    position: relative;
    display: inline-flex;
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 14px;
    line-height: 1;
  }

  .icon-button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .icon-button:disabled {
    color: var(--archinsight-disabled-foreground, var(--vscode-disabledForeground, #666666));
    cursor: default;
  }

  .icon-button:disabled:hover {
    background: var(--archinsight-control-bg, #2a2a2a);
  }

  .has-tooltip {
    position: relative;
  }

  .has-tooltip::after {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    z-index: 30;
    max-width: 220px;
    padding: 6px 8px;
    border: 1px solid var(--archinsight-tooltip-border, #444444);
    border-radius: 4px;
    background: var(--archinsight-tooltip-bg, #181818);
    color: var(--archinsight-tooltip-fg, #eeeeee);
    content: attr(data-tooltip);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    opacity: 0;
    pointer-events: none;
    text-align: center;
    transform: translate(-50%, -2px);
    transition: opacity 120ms ease, transform 120ms ease;
    transition-delay: 0ms;
    white-space: nowrap;
  }

  .has-tooltip:hover::after,
  .has-tooltip:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
    transition-delay: 300ms;
  }

  .download-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    min-width: 210px;
    padding: 4px;
    border: 1px solid var(--archinsight-tooltip-border, #444444);
    border-radius: 4px;
    background: var(--archinsight-menu-bg, #202020);
    box-shadow: var(--archinsight-shadow, 0 8px 18px rgb(0 0 0 / 35%));
  }

  .download-menu button {
    display: block;
    width: 100%;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--archinsight-foreground, #eeeeee);
    font: inherit;
    font-size: 12px;
    line-height: 28px;
    text-align: left;
    white-space: nowrap;
  }

  .download-menu button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .download-menu button:disabled {
    color: var(--archinsight-disabled-foreground, #666666);
    cursor: not-allowed;
  }

  .download-menu button:disabled:hover {
    background: transparent;
  }

  .document-kind-switch {
    display: inline-flex;
    height: 28px;
    border: 1px solid var(--archinsight-border, #3a3a3a);
    border-radius: 4px;
    background: var(--archinsight-control-group-bg, #202020);
  }

  .document-kind-switch button {
    display: inline-grid;
    width: 32px;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--archinsight-muted, #b8b8b8);
    font: inherit;
    font-size: 11px;
  }

  .document-kind-switch button + button {
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .document-kind-switch button:first-child {
    border-radius: 3px 0 0 3px;
  }

  .document-kind-switch button:last-child {
    border-radius: 0 3px 3px 0;
  }

  .document-kind-switch button:hover,
  .document-kind-switch button:focus-visible {
    background: var(--archinsight-control-hover-bg, #343434);
    color: var(--archinsight-foreground, #ffffff);
    outline: none;
  }

  .document-kind-switch button.active {
    background: var(--archinsight-control-active-bg, #36511f);
    color: var(--archinsight-control-active-fg, #ffffff);
  }

  .document-kind-switch .codicon {
    font-size: 15px;
  }

  .codicon-type-hierarchy::before {
    content: "\ebb9";
  }

  .codicon-filter-filled::before {
    content: "\ebce";
  }

</style>
