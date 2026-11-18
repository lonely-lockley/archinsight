<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { DeploymentMode, FindPathMode, IsolateMode } from './diagram-quick-actions';
  import type { DiagramDiffMode } from './versioned-diagram-diff';

  export let mode: FindPathMode = { status: 'idle' };
  export let isolateMode: IsolateMode = { status: 'idle' };
  export let deploymentMode: DeploymentMode = { status: 'idle' };
  export let diffMode: DiagramDiffMode = { status: 'idle' };
  export let onCancel: () => void = () => {};
  export let onBackQuickAction: () => void = () => {};
  export let onCloseQuickActions: () => void = () => {};
  export let onCancelDiff: () => void = () => {};
  export let onReverse: () => void = () => {};

  $: hasQuickActionResult = mode.status === 'showing-path'
    || isolateMode.status !== 'idle'
    || deploymentMode.status === 'showing-deployment';

  onMount(() => window.addEventListener('keydown', handleKeydown, true));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown, true));

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape'
        || (mode.status === 'idle' && isolateMode.status === 'idle' && deploymentMode.status === 'idle' && diffMode.status === 'idle')) return;
    if (document.querySelector('[data-diagram-quick-actions-menu]') !== null) return;
    event.preventDefault();
    event.stopPropagation();
    if (hasQuickActionResult) onBackQuickAction();
    else if (diffMode.status !== 'idle') onCancelDiff();
    else onCancel();
  }
</script>

{#if mode.status !== 'idle' || isolateMode.status !== 'idle' || deploymentMode.status !== 'idle' || diffMode.status !== 'idle'}
  <div class="find-path-actions" aria-label={deploymentMode.status === 'showing-deployment' ? 'Deployment mode' : isolateMode.status === 'showing-drill-down' ? 'Drill down mode' : isolateMode.status === 'showing-isolate' ? 'Isolate mode' : diffMode.status === 'showing-diff' ? 'Diff mode' : 'Find path mode'}>
    <span class="source-dot" aria-hidden="true"></span>
    <span class="mode-status" role="status" aria-live="polite">
      {#if deploymentMode.status === 'showing-deployment'}
        Deployment: {deploymentMode.elementTitle} · {deploymentMode.environment}
      {:else if isolateMode.status === 'showing-isolate'}
        Isolated: {isolateMode.elementTitle}
      {:else if isolateMode.status === 'showing-drill-down'}
        Drill down: {isolateMode.elementTitle}
      {:else if diffMode.status === 'showing-diff'}
        Diff: {diffMode.beforeShort} → {diffMode.afterShort}
      {:else if mode.status === 'selecting-target'}
        Find path: {mode.sourceTitle} → select target
      {:else if mode.status === 'resolving-path'}
        Finding path: {mode.sourceTitle} → {mode.targetTitle}
      {:else}
        Path: {mode.sourceTitle} → {mode.targetTitle}
      {/if}
    </span>
    {#if mode.status === 'showing-path' && isolateMode.status === 'idle' && deploymentMode.status === 'idle'}
      <button
        class="action reverse"
        type="button"
        aria-label="Reverse path direction"
        title="Reverse path direction"
        on:click={onReverse}
      >
        <span class="codicon codicon-sync" aria-hidden="true"></span>
      </button>
    {/if}
    <button
      class="action back"
      class:with-close={hasQuickActionResult}
      type="button"
      aria-label={hasQuickActionResult || diffMode.status === 'showing-diff' ? 'Back to diagram' : 'Cancel find path'}
      title={hasQuickActionResult || diffMode.status === 'showing-diff' ? 'Back to diagram (Esc)' : 'Cancel find path (Esc)'}
      on:click={hasQuickActionResult ? onBackQuickAction : diffMode.status === 'showing-diff' ? onCancelDiff : onCancel}
    >
      <span class={`codicon ${hasQuickActionResult || diffMode.status === 'showing-diff' ? 'codicon-arrow-left' : 'codicon-close'}`} aria-hidden="true"></span>
    </button>
    {#if hasQuickActionResult}
      <button
        class="action close"
        type="button"
        aria-label="Exit to diagram"
        title="Exit to diagram"
        on:click={onCloseQuickActions}
      >
        <span class="codicon codicon-close" aria-hidden="true"></span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .find-path-actions {
    display: inline-flex;
    align-items: center;
    flex: 0 1 auto;
    gap: 0;
    min-width: 0;
    max-width: 480px;
    height: 28px;
    box-sizing: border-box;
    margin-left: 6px;
    padding-left: 9px;
    border: 1px solid #ff9800;
    border-radius: 4px;
    background: var(--archinsight-control-group-bg, #202020);
    color: var(--archinsight-foreground, #eee);
    font-size: 12px;
  }

  .source-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #ff9800;
    margin-right: 7px;
  }

  .mode-status {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 7px;
  }

  .action {
    display: grid;
    place-items: center;
    width: 28px;
    height: 26px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-left: 1px solid color-mix(in srgb, #ff9800 55%, transparent);
    border-radius: 0;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: inherit;
    cursor: pointer;
  }

  .back {
    border-radius: 0 3px 3px 0;
  }

  .back.with-close {
    border-radius: 0;
  }

  .close {
    border-radius: 0 3px 3px 0;
  }

  .action:hover,
  .action:focus-visible {
    background: var(--archinsight-control-hover-bg, #343434);
    outline: 1px solid #ff9800;
    outline-offset: -2px;
  }
</style>
