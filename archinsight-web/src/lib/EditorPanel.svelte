<script lang="ts">
  import { onDestroy } from 'svelte';
  import LogPanel from './LogPanel.svelte';
  import MonacoEditorPanel from './MonacoEditorPanel.svelte';
  import SvgPreviewPanel from './SvgPreviewPanel.svelte';
  import type { EmptyWorkspaceAction, EmptyWorkspaceStrategy } from './empty-workspace-strategy';
  import type { EditorViewMode, MessageView, SourceLocation } from './workspace-types';

  export let active = false;
  export let svg: string | undefined;
  export let viewMode: EditorViewMode = 'split';
  export let diagramScale = 1;
  export let diagramFit = false;
  export let editorSplitRatio = 50;
  export let messages: MessageView[] = [];
  export let messagesVisible = false;
  export let showMessagesPanel = true;
  export let workAreaStyle = '';
  export let editorHost: HTMLDivElement;
  export let messagesPanel: HTMLElement;
  export let onEditorSplitRatioChange: (ratio: number) => void;
  export let onDiagramVisibleScaleChange: (scale: number) => void;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;
  export let onBeginMessagesResize: (event: PointerEvent) => void;
  export let emptyStrategy: EmptyWorkspaceStrategy | undefined = undefined;
  export let onEmptyAction: (action: EmptyWorkspaceAction) => void = () => {};

  let splitHost: HTMLElement;
  let splitResizePointerId: number | undefined;

  $: splitStyle = `--editor-split-width: ${editorSplitRatio}%; --diagram-split-width: ${100 - editorSplitRatio}%;`;

  onDestroy(() => {
    window.removeEventListener('pointermove', resizeEditorSplit);
    window.removeEventListener('pointerup', stopEditorSplitResize);
  });

  function beginEditorSplitResize(event: PointerEvent): void {
    if (viewMode !== 'split') {
      return;
    }
    event.preventDefault();
    splitResizePointerId = event.pointerId;
    window.addEventListener('pointermove', resizeEditorSplit);
    window.addEventListener('pointerup', stopEditorSplitResize, { once: true });
  }

  function resizeEditorSplit(event: PointerEvent): void {
    if (splitResizePointerId === undefined || event.pointerId !== splitResizePointerId || splitHost === undefined) {
      return;
    }
    const bounds = splitHost.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }
    const ratio = ((event.clientX - bounds.left) / bounds.width) * 100;
    onEditorSplitRatioChange(clamp(ratio, 20, 80));
  }

  function stopEditorSplitResize(): void {
    splitResizePointerId = undefined;
    window.removeEventListener('pointermove', resizeEditorSplit);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
</script>

<section class="work-area" style={workAreaStyle}>
  <section
    bind:this={splitHost}
    class:code-only={active && viewMode === 'code'}
    class:diagram-only={active && viewMode === 'diagram'}
    class:empty={!active}
    class="split"
    style={splitStyle}
  >
    <div class="editor-pane">
      <MonacoEditorPanel bind:host={editorHost} {active} />
    </div>
    <div
      class:hidden-split-resize={!active || viewMode !== 'split'}
      class="split-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize editor and diagram"
      aria-valuemin="20"
      aria-valuemax="80"
      aria-valuenow={Math.round(editorSplitRatio)}
      on:pointerdown={beginEditorSplitResize}
    ></div>
    <SvgPreviewPanel
      fit={diagramFit}
      onOpenDeclaration={onOpenDeclaration}
      onVisibleScaleChange={onDiagramVisibleScaleChange}
      scale={diagramScale}
      {svg}
    />
    {#if !active}
      <div class="empty-panel">
        <div class:single={emptyStrategy?.actions.length === 1} class="empty-actions">
          {#each emptyStrategy?.actions ?? [] as action (action.id)}
            <button aria-label={action.label} class:primary={action.primary} class="empty-action" disabled={action.disabled} title={action.reason} type="button" on:click={() => onEmptyAction(action)}>
              <span class="empty-action-icon" aria-hidden="true">
                <span class={`codicon codicon-${action.icon}`}></span>
                <span class="empty-action-label">{action.label}</span>
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </section>
  {#if showMessagesPanel}
    <div
      class:hidden-panel={!messagesVisible}
      class="messages-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize messages"
      on:pointerdown={onBeginMessagesResize}
    ></div>
    <LogPanel bind:panel={messagesPanel} hidden={!messagesVisible} {messages} />
  {/if}
</section>

<style>
  .split {
    position: relative;
    display: grid;
    grid-template-columns:
      minmax(0, var(--editor-split-width))
      6px
      minmax(0, var(--diagram-split-width));
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .split.empty {
    grid-template-columns: minmax(0, 1fr) 0 0;
    background: var(--archinsight-panel-bg, #252525);
  }

  .split.code-only {
    grid-template-columns: minmax(0, 1fr) 0 0;
  }

  .split.diagram-only {
    grid-template-columns: 0 0 minmax(0, 1fr);
  }

  .work-area {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .editor-pane {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--archinsight-border, #181818);
  }

  .empty-panel {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--archinsight-panel-bg, #252525);
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 34px;
  }

  .empty-action {
    display: grid;
    grid-template-rows: 1fr;
    justify-items: center;
    align-items: center;
    width: 224px;
    min-height: 168px;
    padding: 12px 14px;
    border: 1px solid var(--archinsight-border-strong, #4a4a4a);
    border-radius: 8px;
    background: transparent;
    color: var(--archinsight-foreground, #eeeeee);
    font: inherit;
    line-height: 1.2;
  }

  .empty-actions.single .empty-action {
    width: 256px;
    min-height: 190px;
  }

  .empty-action-icon {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    align-items: center;
    width: 100%;
    min-height: 126px;
    padding: 14px 12px 12px;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--archinsight-foreground, #e6e6e6);
  }

  .empty-action-icon .codicon {
    font-size: 68px;
    width: 100%;
    text-align: center;
  }

  .empty-actions.single .empty-action-icon {
    width: 100%;
    min-height: 148px;
  }

  .empty-actions.single .empty-action-icon .codicon {
    font-size: 80px;
  }

  .empty-action-label {
    color: var(--archinsight-foreground, #dcdcdc);
    font-size: 20px;
    font-weight: 300;
    line-height: 1.12;
    text-align: center;
    white-space: nowrap;
  }

  .empty-action:hover,
  .empty-action:focus-visible {
    border-color: var(--archinsight-resize-hover-bg, var(--color-primary));
    background: var(--archinsight-control-active-bg, #36511f);
    outline: none;
  }

  .split-resize {
    position: relative;
    z-index: 3;
    min-width: 6px;
    cursor: col-resize;
    border-left: 1px solid var(--archinsight-border, #151515);
    border-right: 1px solid var(--archinsight-border-strong, #3b3b3b);
    background: var(--archinsight-resize-bg, #262626);
  }

  .split-resize.hidden-split-resize {
    min-width: 0;
    width: 0;
    border: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .split-resize:hover {
    background: color-mix(in srgb, var(--archinsight-resize-hover-bg, var(--color-primary)) 27%, transparent);
  }

  .split.diagram-only .editor-pane,
  .split.code-only :global(.preview-pane),
  .split.empty .editor-pane,
  .split.empty :global(.preview-pane) {
    visibility: hidden;
    pointer-events: none;
  }

  .split.diagram-only .editor-pane,
  .split.empty .editor-pane {
    border-right: 0;
  }

  .messages-resize {
    position: relative;
    z-index: 4;
    min-height: 6px;
    cursor: row-resize;
    border-top: 1px solid var(--archinsight-border, #151515);
    border-bottom: 1px solid var(--archinsight-border-strong, #3b3b3b);
    background: var(--archinsight-resize-bg, #262626);
  }

  .messages-resize.hidden-panel {
    min-height: 0;
    height: 0;
    border: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .messages-resize:hover {
    background: color-mix(in srgb, var(--archinsight-resize-hover-bg, var(--color-primary)) 27%, transparent);
  }

  @media (max-width: 980px) {
    .split {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 0 1fr;
    }

    .split.code-only,
    .split.diagram-only {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 0 0;
    }

    .split.diagram-only {
      grid-template-rows: 0 0 1fr;
    }

    .split-resize {
      min-width: 0;
      height: 0;
      border: 0;
      pointer-events: none;
    }
  }
</style>
