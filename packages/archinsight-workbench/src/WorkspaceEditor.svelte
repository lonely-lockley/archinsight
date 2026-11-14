<script lang="ts">
  import DiagramActions from './DiagramActions.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import EditorViewActions from './EditorViewActions.svelte';
  import FindPathActions from './FindPathActions.svelte';
  import QueryEditorPanel from './QueryEditorPanel.svelte';
  import RefreshActions from './RefreshActions.svelte';
  import type { EmptyWorkspaceAction, EmptyWorkspaceStrategy } from './empty-workspace-strategy';
  import type { DiagramMode, EditorViewMode, MessageView, SourceLocation } from './workspace-types';
  import type { DiagramQuickActionMetadata, QueryParameterValue, QueryTableResult } from '@insight/language';
  import type { DeploymentMode, DiagramQuickActionAnchor, DiagramQuickActionId, FindPathMode, IsolateMode } from './diagram-quick-actions';

  export let active = false;
  export let svg: string | undefined;
  export let queryResult: QueryTableResult | undefined = undefined;
  export let resultLoading = false;
  export let diagramMode: DiagramMode;
  export let query: string;
  export let queryParameters: Readonly<Record<string, QueryParameterValue>> | undefined = undefined;
  export let queryVisible = false;
  export let queryDocument = false;
  export let projectQueries: readonly { readonly name: string; readonly paths: readonly string[]; readonly view?: string }[] = [];
  export let selectedQuery: string | undefined = undefined;
  export let onSelectProjectQuery: (name: string) => void = () => {};
  export let onOpenQueryFile: ((path: string) => void) | undefined = undefined;
  export let queryPanelHeight = 118;
  export let deploymentEnvironments: readonly { readonly id: string; readonly name?: string }[] = [];
  export let deploymentEnvironment: string | undefined = undefined;
  export let deploymentPickerOpen = false;
  export let deploymentPickerAnchor: DiagramQuickActionAnchor | undefined = undefined;
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
  export let quickActionMetadata: DiagramQuickActionMetadata = {};
  export let findPathMode: FindPathMode = { status: 'idle' };
  export let isolateMode: IsolateMode = { status: 'idle' };
  export let deploymentMode: DeploymentMode = { status: 'idle' };
  export let activeTabOwnsQuickActionMode = true;

  export let onSelectDiagramMode: (mode: DiagramMode) => void;
  export let onSelectDeploymentEnvironment: (environment: string) => void = () => {};
  export let onCloseDeploymentPicker: () => void = () => {};
  export let onToggleQuery: () => void;
  export let onQueryChange: (query: string) => void;
  export let onQueryParameterChange: (name: string, value: QueryParameterValue | undefined) => void = () => {};
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
  export let onCancelResult: () => void = () => {};
  export let onDiagramQuickAction: (action: DiagramQuickActionId, elementId: string, anchor?: DiagramQuickActionAnchor) => void = () => {};
  export let onSelectPathTarget: (elementId: string) => void = () => {};
  export let onCancelFindPath: () => void = () => {};
  export let onCancelIsolate: () => void = () => {};
  export let onCancelDeployment: () => void = () => {};
  export let onReverseFindPath: () => void = () => {};

  function selectDiagramMode(mode: DiagramMode): void {
    if (activeTabOwnsQuickActionMode) {
      if (findPathMode.status !== 'idle') onCancelFindPath();
      if (isolateMode.status !== 'idle') onCancelIsolate();
      if (deploymentMode.status !== 'idle') onCancelDeployment();
    }
    onSelectDiagramMode(mode);
  }
</script>

<section class:inactive={!active} class="workspace-editor">
  {#if active}
    <QueryEditorPanel
      {diagramMode}
      {query}
      {queryParameters}
      {queryVisible}
      {queryDocument}
      {projectQueries}
      {selectedQuery}
      {onSelectProjectQuery}
      {onOpenQueryFile}
      {queryPanelHeight}
      {deploymentEnvironments}
      {deploymentEnvironment}
      deploymentPickerOpen={deploymentPickerOpen && deploymentPickerAnchor === undefined}
      onSelectDiagramMode={selectDiagramMode}
      {onSelectDeploymentEnvironment}
      {onCloseDeploymentPicker}
      {onToggleQuery}
      {onQueryChange}
      {onQueryParameterChange}
      {onQueryPanelHeightChange}
    >
      <svelte:fragment slot="leading-actions">
        <slot name="leading-actions"></slot>
      </svelte:fragment>
      <FindPathActions
        slot="mode-actions"
        mode={findPathMode}
        {isolateMode}
        {deploymentMode}
        onCancel={onCancelFindPath}
        {onCancelIsolate}
        {onCancelDeployment}
        onReverse={onReverseFindPath}
      />
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
      {queryResult}
      {resultLoading}
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
      {onCancelResult}
      {onEditorSplitRatioChange}
      {onDiagramVisibleScaleChange}
      {onOpenDeclaration}
      {quickActionMetadata}
      {findPathMode}
      {isolateMode}
      {deploymentMode}
      {deploymentEnvironments}
      {deploymentEnvironment}
      {deploymentPickerOpen}
      {deploymentPickerAnchor}
      {onSelectDeploymentEnvironment}
      {onCloseDeploymentPicker}
      {onDiagramQuickAction}
      {onSelectPathTarget}
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
