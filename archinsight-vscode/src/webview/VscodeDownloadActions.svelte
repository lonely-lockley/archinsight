<script lang="ts">
  import { onDestroy } from 'svelte';

  export let onDownloadSource: () => void;
  export let onDownloadSvg: () => void;
  export let onDownloadPng: () => void;
  export let onDownloadDot: () => void;
  export let canDownloadSvg = false;
  export let canDownloadPng = false;
  export let canDownloadDot = false;

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

<style>
  .download-action {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    height: 28px;
    border: 1px solid var(--archinsight-border, #3a3a3a);
    border-radius: 4px;
    background: var(--archinsight-control-group-bg, #202020);
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 14px;
    line-height: 1;
  }

  .icon-button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
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
    color: var(--archinsight-foreground, #eeeeee);
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
    box-shadow: var(--archinsight-menu-shadow, 0 8px 18px rgb(0 0 0 / 35%));
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
</style>
