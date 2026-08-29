<script context="module" lang="ts">
  import type * as Monaco from 'monaco-editor';
  import { BUILTIN_VIEW_QUERIES } from './generated/builtin-view-queries';
  import type { DiagramMode } from './workspace-types';

  export const defaultDiagramMode: DiagramMode = 'c1';
  export const defaultQuery = BUILTIN_VIEW_QUERIES.c1;

  const savedQueries: Record<DiagramMode, string> = {
    default: BUILTIN_VIEW_QUERIES['no-filter'],
    c1: BUILTIN_VIEW_QUERIES.c1,
    c2: BUILTIN_VIEW_QUERIES.c2,
    c3: BUILTIN_VIEW_QUERIES.c3,
    c4: BUILTIN_VIEW_QUERIES.c4,
    'deployment-system': BUILTIN_VIEW_QUERIES['deployment-system'],
    'deployment-container': BUILTIN_VIEW_QUERIES['deployment-container'],
    deployment: BUILTIN_VIEW_QUERIES.deployment
  };

  export function queryForDiagramMode(mode: DiagramMode): string {
    return savedQueries[mode];
  }

  export function diagramModeForQuery(value: string): DiagramMode | undefined {
    const normalized = normalizeQuery(value);
    for (const [mode, query] of Object.entries(savedQueries) as Array<[DiagramMode, string]>) {
      if (normalized === normalizeQuery(query)) {
        return mode;
      }
    }
    return undefined;
  }

  export function normalizeDiagramMode(value: string | undefined): DiagramMode | undefined {
    return value === 'default' || value === 'c1' || value === 'c2' || value === 'c3' || value === 'c4'
      || value === 'deployment' || value === 'deployment-system' || value === 'deployment-container'
      ? value
      : undefined;
  }

  function normalizeQuery(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  let queryLanguageRegistered = false;

  function registerQueryLanguage(monaco: typeof Monaco): void {
    if (queryLanguageRegistered) {
      return;
    }
    queryLanguageRegistered = true;
    if (!monaco.languages.getLanguages().some((language) => language.id === 'archinsight-query')) {
      monaco.languages.register({ id: 'archinsight-query' });
    }
    monaco.languages.setMonarchTokensProvider('archinsight-query', {
      ignoreCase: true,
      keywords: [
        'MATCH',
        'OPTIONAL',
        'WHERE',
        'RETURN',
        'GROUP',
        'BY',
        'AND',
        'OR',
        'NOT',
        'CONTAINS',
        'TRUE',
        'FALSE',
        'NULL',
        'AS'
      ],
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/'([^'\\]|\\.)*$/, 'string.invalid'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/\$[A-Za-z_][\w]*/, 'variable.predefined'],
          [/:[A-Za-z_][\w]*/, 'type.identifier'],
          [/[A-Za-z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
          [/\d+/, 'number'],
          [/[{}()[\],.;]/, 'delimiter'],
          [/[-=<>!]+/, 'operator'],
          [/\s+/, 'white']
        ]
      }
    });
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  export let diagramMode: DiagramMode;
  export let query: string;
  export let queryVisible = false;
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

  $: normalizedQueryPanelHeight = clampQueryPanelHeight(queryPanelHeight);
  $: queryEditorStyle = queryVisible
    ? `grid-template-rows: 36px ${normalizedQueryPanelHeight}px 6px;`
    : 'grid-template-rows: 36px;';
  $: if (queryVisible) {
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
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (deploymentPickerOpen && event.key === 'Escape') {
      event.preventDefault();
      onCloseDeploymentPicker();
    }
  }

  async function ensureQueryEditor(): Promise<void> {
    await tick();
    if (!queryVisible || queryHost === undefined || queryEditor !== undefined) {
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
</script>

<section class:query-open={queryVisible} class="query-editor" style={queryEditorStyle}>
  <header class="toolbar">
    <slot name="leading-actions"></slot>

    <div class="diagram-modes tool-group" aria-label="View query preset">
      <button aria-label="No filter view" class:active-mode={diagramMode === 'default'} type="button" on:click={() => onSelectDiagramMode('default')}>
        <span aria-hidden="true">No filter</span>
      </button>
      <button aria-label="C1 context view" class:active-mode={diagramMode === 'c1'} class="has-tooltip" data-tooltip="C1 context view" type="button" on:click={() => onSelectDiagramMode('c1')}>
        <span aria-hidden="true">C1</span>
      </button>
      <button aria-label="C2 container view" class:active-mode={diagramMode === 'c2'} class="has-tooltip" data-tooltip="C2 container view" type="button" on:click={() => onSelectDiagramMode('c2')}>
        <span aria-hidden="true">C2</span>
      </button>
      <button aria-label="C3 component view" class:active-mode={diagramMode === 'c3'} class="has-tooltip" data-tooltip="C3 component view" type="button" on:click={() => onSelectDiagramMode('c3')}>
        <span aria-hidden="true">C3</span>
      </button>
      <button aria-label="C4 code view" class:active-mode={diagramMode === 'c4'} class="has-tooltip" data-tooltip="C4 code view" type="button" on:click={() => onSelectDiagramMode('c4')}>
        <span aria-hidden="true">C4</span>
      </button>
      <button aria-label="D1 system deployment view" class:active-mode={diagramMode === 'deployment-system'} class="has-tooltip" data-tooltip="D1 system deployment overview" type="button" on:click={() => onSelectDiagramMode('deployment-system')}>
        <span aria-hidden="true">D1</span>
      </button>
      <div class="deployment-picker-host" bind:this={deploymentPickerHost}>
        <button aria-expanded={deploymentPickerOpen} aria-haspopup="listbox" aria-label="D2 container deployment view" class:active-mode={diagramMode === 'deployment-container'} class="has-tooltip" data-tooltip="D2 container deployment by environment" type="button" on:click={() => onSelectDiagramMode('deployment-container')}>
          <span aria-hidden="true">D2</span>
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
    </div>

    <div class="query-actions tool-group" aria-label="Query actions">
      <button aria-label="Edit query" class:active-tool={queryVisible} class="icon-button has-tooltip" data-tooltip="Edit query" type="button" on:click={onToggleQuery}>
        <span aria-hidden="true" class="query-icon"></span>
      </button>
    </div>

    <slot name="diagram-actions"></slot>
    <slot name="view-actions"></slot>
    <slot name="refresh-actions"></slot>
  </header>

  {#if queryVisible}
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

  .deployment-picker-host {
    position: relative;
    align-self: stretch;
    border-left: 1px solid var(--archinsight-border, #3a3a3a);
  }

  .deployment-picker-host > button {
    height: 26px;
    border-radius: 0 3px 3px 0;
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
