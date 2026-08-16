<script lang="ts">
  import DiagramActions from './DiagramActions.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import EditorViewActions from './EditorViewActions.svelte';
  import QueryEditorPanel from './QueryEditorPanel.svelte';
  import RefreshActions from './RefreshActions.svelte';
  import type { EmptyWorkspaceAction, EmptyWorkspaceStrategy } from './empty-workspace-strategy';
  import type { DiagramMode, EditorViewMode, MessageView, SourceLocation } from './workspace-types';

  export let active = false;
  export let svg: string | undefined;
  export let diagramMode: DiagramMode;
  export let query: string;
  export let queryVisible = false;
  export let queryPanelHeight = 118;
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
  export let refreshDisabled = false;
  export let emptyStrategy: EmptyWorkspaceStrategy | undefined = undefined;

  export let onSelectDiagramMode: (mode: DiagramMode) => void;
  export let onToggleQuery: () => void;
  export let onQueryChange: (query: string) => void;
  export let onQueryPanelHeightChange: (height: number) => void;
  export let onZoomIn: () => void;
  export let onZoomOut: () => void;
  export let onFitDiagram: () => void;
  export let onActualSize: () => void;
  export let onSelectViewMode: (mode: EditorViewMode) => void;
  export let onRefresh: () => void;
  export let onEditorSplitRatioChange: (ratio: number) => void;
  export let onDiagramVisibleScaleChange: (scale: number) => void;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;
  export let onBeginMessagesResize: (event: PointerEvent) => void;
  export let onEmptyAction: (action: EmptyWorkspaceAction) => void = () => {};
</script>

<section class:inactive={!active} class="workspace-editor">
  {#if active}
    <QueryEditorPanel
      {diagramMode}
      {query}
      {queryVisible}
      {queryPanelHeight}
      {onSelectDiagramMode}
      {onToggleQuery}
      {onQueryChange}
      {onQueryPanelHeightChange}
    >
      <svelte:fragment slot="leading-actions">
        <slot name="leading-actions"></slot>
      </svelte:fragment>
      <DiagramActions
        slot="diagram-actions"
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitDiagram={onFitDiagram}
        onActualSize={onActualSize}
      />
      <EditorViewActions
        slot="view-actions"
        {viewMode}
        onSelectViewMode={onSelectViewMode}
      />
      <RefreshActions
        slot="refresh-actions"
        {refreshDisabled}
        onRefresh={onRefresh}
      />
    </QueryEditorPanel>
  {/if}

  <section class:no-toolbar={!active} class="editor-slot">
    <EditorPanel
      {active}
      {svg}
      {viewMode}
      {diagramScale}
      {diagramFit}
      {editorSplitRatio}
      {messages}
      {messagesVisible}
      {showMessagesPanel}
      {workAreaStyle}
      bind:editorHost
      bind:messagesPanel
      {emptyStrategy}
      {onEmptyAction}
      {onEditorSplitRatioChange}
      {onDiagramVisibleScaleChange}
      {onOpenDeclaration}
      {onBeginMessagesResize}
    />
  </section>
</section>

<style>
  .workspace-editor {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .workspace-editor.inactive {
    grid-template-rows: minmax(0, 1fr);
  }

  .editor-slot {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .editor-slot.no-toolbar {
    min-height: 0;
  }
</style>
