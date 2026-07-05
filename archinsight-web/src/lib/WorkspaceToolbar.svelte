<script lang="ts">
  import { onDestroy } from 'svelte';

  export let onNewFile: () => void;
  export let onSave: () => void;
  export let onDownloadSource: () => void;
  export let onDownloadSvg: () => void;
  export let onDownloadPng: () => void;
  export let onDownloadDot: () => void;
  export let canDownloadSvg = false;
  export let canDownloadPng = false;
  export let canDownloadDot = false;
  export let saveDisabled = false;

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

<div class="file-actions" aria-label="File actions">
  <button aria-label="New" class="icon-button has-tooltip" data-tooltip="New" type="button" on:click={onNewFile}>
    <span aria-hidden="true" class="codicon codicon-new-file"></span>
  </button>
  <button aria-label="Save" class="icon-button has-tooltip" data-tooltip="Save" disabled={saveDisabled} type="button" on:click={onSave}>
    <span aria-hidden="true" class="codicon codicon-save"></span>
  </button>
  <div class="download-action">
    <button aria-expanded={downloadOpen} aria-haspopup="menu" aria-label="Download" class="icon-button has-tooltip" data-tooltip="Download" type="button" on:click={toggleDownloadMenu}>
      <span aria-hidden="true" class="codicon codicon-cloud-download"></span>
    </button>
    {#if downloadOpen}
      <div class="download-menu" role="menu" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
        <button role="menuitem" type="button" on:click={() => download(onDownloadSource)}>download source</button>
        <button disabled={!canDownloadSvg} role="menuitem" type="button" on:click={() => download(onDownloadSvg)}>download diagram as svg</button>
        <button disabled={!canDownloadPng} role="menuitem" type="button" on:click={() => download(onDownloadPng)}>download diagram as png</button>
        <button disabled={!canDownloadDot} role="menuitem" type="button" on:click={() => download(onDownloadDot)}>download diagram as DOT</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .file-actions {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    height: 28px;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #202020;
  }

  .file-actions > button,
  .download-action > button {
    border-radius: 0;
  }

  .file-actions > button + button,
  .download-action {
    border-left: 1px solid #3a3a3a;
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
    background: #2a2a2a;
    color: #eeeeee;
    font-size: 14px;
    line-height: 1;
  }

  .icon-button:hover {
    background: #343434;
  }

  .icon-button:disabled {
    color: var(--vscode-disabledForeground, #666666);
    cursor: default;
  }

  .icon-button:disabled:hover {
    background: #2a2a2a;
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
    border: 1px solid #444444;
    border-radius: 4px;
    background: #181818;
    color: #eeeeee;
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
    border: 1px solid #444444;
    border-radius: 4px;
    background: #202020;
    box-shadow: 0 8px 18px rgb(0 0 0 / 35%);
  }

  .download-menu button {
    display: block;
    width: 100%;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #eeeeee;
    font: inherit;
    font-size: 12px;
    line-height: 28px;
    text-align: left;
    white-space: nowrap;
  }

  .download-menu button:hover {
    background: #343434;
  }

  .download-menu button:disabled {
    color: #666666;
    cursor: not-allowed;
  }

  .download-menu button:disabled:hover {
    background: transparent;
  }
</style>
