<script context="module" lang="ts">
  import type * as Monaco from 'monaco-editor';
  import type { DiagramMode } from './workspace-types';

  import { registerQueryLanguage } from './query-monaco';
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { BUILTIN_VIEW_DEFINITIONS, type BuiltinViewDefinition } from '@insight/language';

  export let diagramMode: DiagramMode;
  export let query: string;
  export let queryVisible = false;
  export let queryDocument = false;
  export let projectQueries: readonly { readonly name: string; readonly paths: readonly string[]; readonly view?: string }[] = [];
  export let selectedQuery: string | undefined = undefined;
  export let onSelectProjectQuery: (name: string) => void = () => {};
  export let onOpenQueryFile: ((path: string) => void) | undefined = undefined;
  export let queryPanelHeight = 118;
  export let onSelectDiagramMode: (mode: DiagramMode) => void;
  export let deploymentEnvironments: readonly { readonly id: string; readonly name?: string }[] = [];
  export let deploymentEnvironment: string | undefined = undefined;
  export let deploymentPickerOpen = false;
  export let onSelectDeploymentEnvironment: (environment: string) => void = () => {};
  export let onCloseDeploymentPicker: () => void = () => {};
  export let onToggleQuery: () => void;
  export let onQueryChange: (query: string) => void;
  export let onQueryPanelHeightChange: (height: number) => void;

  const minQueryPanelHeight = 80;
  const maxQueryPanelHeight = 360;
  $: viewControls = BUILTIN_VIEW_DEFINITIONS
    .filter((definition) => definition.lifecycle === 'stable' && (!queryDocument || (definition.environment === 'single-relevant' && definition.id === diagramMode)))
    .map((definition) => ({ definition, mode: diagramModeForDefinition(definition) }));
  $: customViews = queryDocument ? [] : projectQueries.filter((query) => query.view === undefined);

  let monaco: typeof Monaco | undefined;
  let queryHost: HTMLDivElement;
  let queryEditor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let queryModel: Monaco.editor.ITextModel | undefined;
  let suppressQueryChange = false;
  let resizeStart: { pointerId: number; startY: number; height: number } | undefined;
  let environmentFilter = '';
  let deploymentPickerHost: HTMLDivElement;
  let deploymentEnvironmentSet = '';
  let deploymentPickerWasOpen = false;
  let customViewPickerHost: HTMLDivElement;
  let customViewPickerOpen = false;

  $: normalizedQueryPanelHeight = clampQueryPanelHeight(queryPanelHeight);
  $: queryEditorStyle = queryVisible && !queryDocument
    ? `grid-template-rows: 36px ${normalizedQueryPanelHeight}px 6px;`
    : 'grid-template-rows: 36px;';
  $: if (queryVisible && !queryDocument) {
    void ensureQueryEditor();
  } else {
    disposeQueryEditor();
  }
  $: if (queryModel !== undefined && !suppressQueryChange && queryModel.getValue() !== query) {
    suppressQueryChange = true;
    queryModel.setValue(query);
    suppressQueryChange = false;
  }
  $: if (queryEditor !== undefined) {
    void tick().then(() => queryEditor?.layout());
  }
  $: filteredDeploymentEnvironments = deploymentEnvironments.filter((environment) => {
    const value = environmentFilter.trim().toLocaleLowerCase();
    return value.length === 0
      || environment.id.toLocaleLowerCase().includes(value)
      || environment.name?.toLocaleLowerCase().includes(value) === true;
  });
  $: {
    const nextEnvironmentSet = deploymentEnvironments.map((environment) => environment.id).join('\0');
    const opened = deploymentPickerOpen && !deploymentPickerWasOpen;
    if (!deploymentPickerOpen || opened || nextEnvironmentSet !== deploymentEnvironmentSet) {
      environmentFilter = '';
    }
    deploymentEnvironmentSet = nextEnvironmentSet;
    deploymentPickerWasOpen = deploymentPickerOpen;
  }

  onMount(() => {
    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('keydown', handleWindowKeydown);
  });

  onDestroy(() => {
    stopQueryResize();
    disposeQueryEditor();
    window.removeEventListener('pointerdown', handleWindowPointerDown);
    window.removeEventListener('keydown', handleWindowKeydown);
  });

  function handleWindowPointerDown(event: PointerEvent): void {
    if (deploymentPickerOpen
      && event.target instanceof Node
      && !deploymentPickerHost?.contains(event.target)) {
      onCloseDeploymentPicker();
    }
    if (customViewPickerOpen
      && event.target instanceof Node
      && !customViewPickerHost?.contains(event.target)) {
      customViewPickerOpen = false;
    }
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if ((deploymentPickerOpen || customViewPickerOpen) && event.key === 'Escape') {
      event.preventDefault();
      if (deploymentPickerOpen) onCloseDeploymentPicker();
      customViewPickerOpen = false;
    }
  }

  function toggleCustomViewPicker(): void {
    customViewPickerOpen = !customViewPickerOpen;
    if (customViewPickerOpen && deploymentPickerOpen) onCloseDeploymentPicker();
  }

  function selectProjectQuery(name: string): void {
    customViewPickerOpen = false;
    onSelectProjectQuery(name);
  }

  function openProjectQuery(path: string): void {
    customViewPickerOpen = false;
    onOpenQueryFile?.(path);
  }

  async function ensureQueryEditor(): Promise<void> {
    await tick();
    if (!queryVisible || queryDocument || queryHost === undefined || queryEditor !== undefined) {
      return;
    }
    monaco = await import('monaco-editor');
    registerQueryLanguage(monaco);
    queryModel = monaco.editor.createModel(query, 'archinsight-query');
    queryEditor = monaco.editor.create(queryHost, {
      model: queryModel,
      automaticLayout: true,
      fontSize: 12,
      lineNumbers: 'off',
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      renderLineHighlight: 'none',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      }
    });
    queryModel.onDidChangeContent(() => {
      if (suppressQueryChange || queryModel === undefined) {
        return;
      }
      onQueryChange(queryModel.getValue());
    });
  }

  function disposeQueryEditor(): void {
    queryEditor?.dispose();
    queryEditor = undefined;
    queryModel?.dispose();
    queryModel = undefined;
  }

  function beginQueryResize(event: PointerEvent): void {
    event.preventDefault();
    resizeStart = {
      pointerId: event.pointerId,
      startY: event.clientY,
      height: normalizedQueryPanelHeight
    };
    window.addEventListener('pointermove', resizeQueryPanel);
    window.addEventListener('pointerup', stopQueryResize, { once: true });
  }

  function resizeQueryPanel(event: PointerEvent): void {
    if (resizeStart === undefined || event.pointerId !== resizeStart.pointerId) {
      return;
    }
    onQueryPanelHeightChange(clampQueryPanelHeight(resizeStart.height + event.clientY - resizeStart.startY));
  }

  function stopQueryResize(): void {
    resizeStart = undefined;
    window.removeEventListener('pointermove', resizeQueryPanel);
  }

  function clampQueryPanelHeight(value: number): number {
    return Math.max(minQueryPanelHeight, Math.min(maxQueryPanelHeight, value));
  }

  function diagramModeForDefinition(definition: BuiltinViewDefinition): DiagramMode {
    return definition.id === 'no-filter' ? 'default' : definition.id;
  }
</script>

<section class:query-open={queryVisible} class="query-editor" style={queryEditorStyle}>
  <header class="toolbar">
    <slot name="leading-actions"></slot>

    <div class:has-custom-views={customViews.length > 0} class="diagram-modes tool-group" aria-label="View query preset">
      {#each viewControls as control (control.definition.id)}
        {#if control.definition.environment === 'single-relevant'}
          <div class="deployment-picker-host" bind:this={deploymentPickerHost}>
            <button aria-expanded={deploymentPickerOpen} aria-haspopup="listbox" aria-label={`${control.definition.label} view`} class:active-mode={selectedQuery === undefined && diagramMode === control.mode} class="has-tooltip" data-tooltip={control.definition.label} type="button" on:click={() => onSelectDiagramMode(control.mode)}>
              <span aria-hidden="true">{control.definition.shortLabel}</span>
            </button>
            {#if deploymentPickerOpen}
              <div class="environment-picker" role="dialog" aria-label="Select deployment environment">
                {#if deploymentEnvironments.length > 1}
                  <input bind:value={environmentFilter} aria-label="Filter environments" placeholder="Filter environments" type="search" />
                {/if}
                <div class="environment-options" role="listbox">
                  {#each filteredDeploymentEnvironments as environment (environment.id)}
                    <button
                      aria-selected={environment.id === deploymentEnvironment}
                      class:selected={environment.id === deploymentEnvironment}
                      role="option"
                      type="button"
                      on:click={() => onSelectDeploymentEnvironment(environment.id)}
                    >
                      <span>{environment.id}</span>
                      {#if environment.name !== undefined && environment.name !== environment.id}<small>{environment.name}</small>{/if}
                    </button>
                  {/each}
                  {#if filteredDeploymentEnvironments.length === 0}
                    <div class="environment-empty">
                      {deploymentEnvironments.length === 0
                        ? 'No deployment environments are relevant to this source'
                        : 'No matching environments'}
                    </div>
                  {/if}
                </div>
                <button class="environment-close" type="button" on:click={onCloseDeploymentPicker}>Cancel</button>
              </div>
            {/if}
          </div>
        {:else}
          <button aria-label={`${control.definition.label} view`} class:active-mode={selectedQuery === undefined && diagramMode === control.mode} class="has-tooltip" data-tooltip={control.definition.label} type="button" on:click={() => onSelectDiagramMode(control.mode)}>
            <span aria-hidden="true">{control.definition.shortLabel}</span>
          </button>
        {/if}
      {/each}
      {#if customViews.length > 0}
        <div class="custom-view-picker-host" bind:this={customViewPickerHost}>
          <button
            aria-expanded={customViewPickerOpen}
            aria-haspopup="listbox"
            aria-label="Custom view"
            class:active-mode={selectedQuery !== undefined}
            class="custom-view-trigger"
            type="button"
            on:click={toggleCustomViewPicker}
          >
            <span>{customViews.some((query) => query.name === selectedQuery) ? selectedQuery : 'Custom'}</span>
            <i class="codicon codicon-chevron-down" aria-hidden="true"></i>
          </button>
          {#if customViewPickerOpen}
            <div class="custom-view-picker" role="listbox" aria-label="Project views">
              {#each customViews as projectQuery (projectQuery.name)}
                <div class:selected={projectQuery.name === selectedQuery} class="custom-view-option">
                  <button
                    aria-selected={projectQuery.name === selectedQuery}
                    class="custom-view-choice"
                    role="option"
                    type="button"
                    on:click={() => selectProjectQuery(projectQuery.name)}
                  >
                    <span>{projectQuery.name}</span>
                    {#if projectQuery.paths.length > 1}<small>conflict</small>{/if}
                  </button>
                  {#if onOpenQueryFile !== undefined}
                    <button
                      aria-label={`Go to ${projectQuery.name} query file`}
                      class="custom-view-open has-tooltip"
                      data-tooltip={projectQuery.paths.length === 1 ? 'Go to query file' : 'Query name is ambiguous'}
                      disabled={projectQuery.paths.length !== 1}
                      type="button"
                      on:click={() => openProjectQuery(projectQuery.paths[0]!)}
                    >
                      <i class="codicon codicon-go-to-file" aria-hidden="true"></i>
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if !queryDocument}
    <div class="query-actions tool-group" aria-label="Query actions">
      <button aria-label="Edit query" class:active-tool={queryVisible} class="icon-button has-tooltip" data-tooltip="Edit query" type="button" on:click={onToggleQuery}>
        <span aria-hidden="true" class="query-icon"></span>
      </button>
    </div>

    {/if}

    <slot name="diagram-actions"></slot>
    <slot name="view-actions"></slot>
    <slot name="refresh-actions"></slot>
  </header>

  {#if queryVisible && !queryDocument}
    <section class="query-panel" aria-label="Graph query">
      <div bind:this={queryHost} class="query-monaco"></div>
    </section>
    <div
      class="query-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize query editor"
      on:pointerdown={beginQueryResize}
    ></div>
  {/if}
</section>

<style>
  .query-editor {
    display: grid;
    min-width: 0;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1px;
    height: 36px;
    box-sizing: border-box;
    padding: 0 12px;
    border-bottom: 1px solid var(--archinsight-border, #333333);
    background: var(--archinsight-toolbar-bg, #242424);
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
    height: 26px;
    border: 0;
    border-radius: 0;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
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

  .tool-group button:only-child {
    border-radius: 3px;
  }

  .diagram-modes {
    margin-right: 0;
  }

  .diagram-modes button {
    width: auto;
    min-width: 32px;
    padding: 0 7px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0;
  }

  .diagram-modes button.active-mode {
    background: var(--archinsight-control-active-bg, #354436);
    color: var(--archinsight-control-active-fg, #ffffff);
    font-weight: 500;
  }

  .diagram-modes button:hover {
    background: var(--archinsight-control-hover-bg, #343434);
    color: var(--archinsight-foreground, #eeeeee);
  }

  .diagram-modes button.active-mode:hover {
    background: var(--archinsight-control-active-bg, #354436);
    color: var(--archinsight-control-active-fg, #ffffff);
  }

  .custom-view-picker-host {
    position: relative;
    align-self: stretch;
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .diagram-modes .custom-view-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 88px;
    border-radius: 0 3px 3px 0;
  }

  .custom-view-trigger > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .custom-view-trigger .codicon {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 12px;
  }

  .custom-view-picker {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    min-width: 220px;
    padding: 4px;
    border: 1px solid var(--archinsight-border, #454545);
    border-radius: 4px;
    background: var(--archinsight-toolbar-bg, #242424);
    box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
  }

  .custom-view-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    min-height: 32px;
    border-radius: 3px;
  }

  .custom-view-option:hover,
  .custom-view-option.selected {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .custom-view-option.selected {
    background: var(--archinsight-control-active-bg, #354436);
  }

  .diagram-modes .custom-view-option button {
    width: auto;
    height: auto;
    min-width: 0;
    min-height: 32px;
    border-radius: 0;
    background: transparent;
  }

  .diagram-modes .custom-view-choice {
    display: flex;
    align-items: center;
    gap: 7px;
    justify-content: space-between;
    overflow: hidden;
    padding: 0 8px;
    text-align: left;
  }

  .custom-view-choice > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .custom-view-choice small {
    color: var(--archinsight-muted, #a8a8a8);
    font-size: 10px;
  }

  .diagram-modes .custom-view-open {
    display: grid;
    place-items: center;
    padding: 0;
    border-left: 1px solid var(--archinsight-border, #454545);
  }

  .diagram-modes .custom-view-open:hover,
  .diagram-modes .custom-view-open:focus-visible {
    background: rgb(255 255 255 / 8%);
    outline: none;
  }

  .diagram-modes .custom-view-open:disabled {
    color: var(--archinsight-muted, #666666);
    cursor: default;
  }

  .deployment-picker-host {
    position: relative;
    align-self: stretch;
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .deployment-picker-host > button {
    height: 26px;
    border-radius: 0 3px 3px 0;
  }

  .diagram-modes.has-custom-views .deployment-picker-host > button {
    border-radius: 0;
  }

  .environment-picker {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    width: 280px;
    padding: 8px;
    border: 1px solid var(--archinsight-border, #454545);
    border-radius: 6px;
    background: var(--archinsight-toolbar-bg, #242424);
    box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
  }

  .environment-picker input {
    box-sizing: border-box;
    width: 100%;
    height: 30px;
    margin-bottom: 6px;
    padding: 0 8px;
    border: 1px solid var(--archinsight-border, #454545);
    border-radius: 4px;
    background: var(--archinsight-input-bg, #1f1f1f);
    color: var(--archinsight-foreground, #eeeeee);
  }

  .environment-options {
    max-height: 260px;
    overflow-y: auto;
  }

  .environment-picker .environment-options button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    height: auto;
    min-height: 38px;
    padding: 6px 8px;
    border: 0;
    border-radius: 4px;
    text-align: left;
  }

  .environment-picker .environment-options button.selected {
    background: var(--archinsight-control-active-bg, #354436);
  }

  .environment-picker small {
    color: var(--archinsight-muted, #a8a8a8);
  }

  .environment-empty {
    padding: 10px 8px;
    color: var(--archinsight-muted, #a8a8a8);
    font-size: 12px;
  }

  .environment-picker .environment-close {
    width: 100%;
    margin-top: 6px;
    border-radius: 4px;
  }

  .query-icon {
    position: relative;
    display: block;
    width: 14px;
    height: 14px;
  }

  .query-icon::before {
    position: absolute;
    top: 2px;
    left: 1px;
    width: 10px;
    height: 11px;
    border: 1.25px solid currentColor;
    border-radius: 50% / 18%;
    content: "";
  }

  .query-icon::after {
    position: absolute;
    right: -1px;
    bottom: 1px;
    width: 9px;
    height: 7px;
    background: currentColor;
    clip-path: polygon(0 0, 100% 0, 62% 45%, 62% 100%, 38% 100%, 38% 45%);
    content: "";
  }

  .query-panel {
    display: grid;
    min-width: 0;
    min-height: 0;
    background: var(--archinsight-toolbar-bg, #242424);
  }

  .query-monaco {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--archinsight-panel-bg, #1f1f1f);
  }

  .query-resize {
    position: relative;
    z-index: 4;
    min-height: 6px;
    cursor: row-resize;
    border-top: 1px solid var(--archinsight-border, #151515);
    border-bottom: 1px solid var(--archinsight-border-strong, #3b3b3b);
    background: var(--archinsight-resize-bg, #262626);
  }

  .query-resize:hover {
    background: color-mix(in srgb, var(--archinsight-resize-hover-bg, var(--color-primary)) 27%, transparent);
  }
</style>
