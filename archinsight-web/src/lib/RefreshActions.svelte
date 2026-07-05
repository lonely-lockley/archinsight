<script lang="ts">
  export let refreshDisabled = false;
  export let onRefresh: () => void;
</script>

<div class="refresh-actions tool-group" aria-label="Refresh actions">
  <button aria-label="Refresh" class="icon-button has-tooltip" data-tooltip="Refresh" disabled={refreshDisabled} type="button" on:click={onRefresh}>
    <span aria-hidden="true" class="codicon codicon-refresh"></span>
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

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 14px;
    line-height: 1;
  }

  .icon-button:only-child {
    border-radius: 3px;
  }

  .icon-button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .icon-button:disabled {
    color: var(--archinsight-disabled-foreground, #666666);
    cursor: not-allowed;
    background: var(--archinsight-panel-bg, #242424);
  }

  .icon-button:disabled:hover {
    background: var(--archinsight-panel-bg, #242424);
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
