<script lang="ts">
  export let onZoomIn: () => void;
  export let onZoomOut: () => void;
  export let onFitDiagram: () => void;
  export let onActualSize: () => void;
</script>

<div class="diagram-actions tool-group" aria-label="Diagram actions">
  <button aria-label="Zoom in" class="icon-button has-tooltip" data-tooltip="Zoom in" type="button" on:click={onZoomIn}>
    <span aria-hidden="true" class="codicon codicon-zoom-in"></span>
  </button>
  <button aria-label="Zoom out" class="icon-button has-tooltip" data-tooltip="Zoom out" type="button" on:click={onZoomOut}>
    <span aria-hidden="true" class="codicon codicon-zoom-out"></span>
  </button>
  <button aria-label="Fit diagram" class="icon-button has-tooltip" data-tooltip="Fit diagram" type="button" on:click={onFitDiagram}>
    <span aria-hidden="true" class="codicon codicon-screen-full"></span>
  </button>
  <button aria-label="Actual size" class="icon-button has-tooltip" data-tooltip="Actual size" type="button" on:click={onActualSize}>
    <span aria-hidden="true" class="actual-size-icon">1:1</span>
  </button>
</div>

<style>
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

  .actual-size-icon {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
  }
</style>
