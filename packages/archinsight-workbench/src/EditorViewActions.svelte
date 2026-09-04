<script lang="ts">
  import type { EditorViewMode } from './workspace-types';

  export let viewMode: EditorViewMode;
  export let onSelectViewMode: (mode: EditorViewMode) => void;
</script>

<div class="view-actions tool-group" aria-label="Editor view mode">
  <button aria-label="Code only" class:active-tool={viewMode === 'code'} class="icon-button has-tooltip" data-tooltip="Code only" type="button" on:click={() => onSelectViewMode('code')}>
    <span aria-hidden="true" class="codicon codicon-layout-sidebar-left"></span>
  </button>
  <button aria-label="Split view" class:active-tool={viewMode === 'split'} class="icon-button has-tooltip" data-tooltip="Split view" type="button" on:click={() => onSelectViewMode('split')}>
    <span aria-hidden="true" class="codicon codicon-split-horizontal"></span>
  </button>
  <button aria-label="Diagram only" class:active-tool={viewMode === 'diagram'} class="icon-button has-tooltip" data-tooltip="Diagram only" type="button" on:click={() => onSelectViewMode('diagram')}>
    <span aria-hidden="true" class="codicon codicon-layout-sidebar-right"></span>
  </button>
</div>

<style>
  .codicon-layout-sidebar-left::before {
    content: "\ebf3";
  }

  .codicon-layout-sidebar-right::before {
    content: "\ebf4";
  }

  .tool-group {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    height: 28px;
    margin-left: 6px;
    border: 1px solid var(--archinsight-border, #3a3a3a);
    border-radius: 4px;
    background: var(--archinsight-control-group-bg, #202020);
  }

  .tool-group button {
    border-radius: 0;
  }

  .tool-group button + button {
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .tool-group button:first-child {
    border-radius: 3px 0 0 3px;
  }

  .tool-group button:last-child {
    border-radius: 0 3px 3px 0;
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 26px;
    padding: 0;
    border: 0;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 14px;
    line-height: 1;
  }

  .icon-button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .icon-button.active-tool {
    background: var(--archinsight-control-active-bg, #354436);
    color: var(--archinsight-control-active-fg, #ffffff);
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
</style>
