<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import {
    canonicalDiagramElementId,
    diagramElementMetadata,
    parseRenderIdentity,
    type DiagramQuickActionMetadata
  } from '@insight/language';
  import DiagramQuickActions from './DiagramQuickActions.svelte';
  import type { DeploymentMode, DiagramQuickActionAnchor, DiagramQuickActionId, FindPathMode, IsolateMode } from './diagram-quick-actions';
  import { sanitizeSvg } from './svg-sanitizer';
  import type { SourceLocation } from './workspace-types';

  export let svg: string | undefined;
  export let scale = 1;
  export let fit = false;
  export let onVisibleScaleChange: (scale: number) => void = () => {};
  export let onOpenDeclaration: (declaration: SourceLocation) => void = () => {};
  export let quickActionMetadata: DiagramQuickActionMetadata = {};
  export let findPathMode: FindPathMode = { status: 'idle' };
  export let isolateMode: IsolateMode = { status: 'idle' };
  export let deploymentMode: DeploymentMode = { status: 'idle' };
  export let deploymentEnvironments: readonly { readonly id: string; readonly name?: string }[] = [];
  export let deploymentEnvironment: string | undefined = undefined;
  export let deploymentPickerOpen = false;
  export let deploymentPickerAnchor: DiagramQuickActionAnchor | undefined = undefined;
  export let onSelectDeploymentEnvironment: (environment: string) => void = () => {};
  export let onCloseDeploymentPicker: () => void = () => {};
  export let onDiagramQuickAction: (action: DiagramQuickActionId, elementId: string, anchor?: DiagramQuickActionAnchor) => void = () => {};
  export let onSelectPathTarget: (elementId: string) => void = () => {};

  let previewPane: HTMLDivElement;
  let svgHost: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  let clickHandlerHost: HTMLDivElement | undefined;
  let lastReportedScale = Number.NaN;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let selectedElementId: string | undefined;
  let lastSvgViewportToken: string | undefined;
  let svgViewportGeneration = 0;

  $: diagramWidth = naturalWidth > 0 ? `${naturalWidth * Math.max(scale, 0.01)}px` : 'auto';
  $: diagramHeight = naturalHeight > 0 ? `${naturalHeight * Math.max(scale, 0.01)}px` : 'auto';
  $: sanitizedSvg = sanitizeSvg(svg);
  $: {
    if (sanitizedSvg !== lastSvgViewportToken) {
      lastSvgViewportToken = sanitizedSvg;
      naturalWidth = 0;
      naturalHeight = 0;
      lastReportedScale = Number.NaN;
      void syncReplacedSvgViewport(++svgViewportGeneration);
    }
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(() => reportVisibleScale());
    if (previewPane instanceof Element) {
      resizeObserver.observe(previewPane);
    }
    if (svgHost instanceof Element) {
      resizeObserver.observe(svgHost);
    }
    reportVisibleScale();
  });

  afterUpdate(() => {
    syncSvgClickHandler();
    syncDiagramNodeState();
    void tick().then(reportVisibleScale);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    clickHandlerHost?.removeEventListener('click', handleSvgClick);
  });

  function reportVisibleScale(): void {
    const element = svgHost?.querySelector('svg');
    if (!(element instanceof SVGSVGElement)) {
      return;
    }
    updateNaturalSize(element);
    const visibleScale = fit ? fittedScale(element) : Math.max(scale, 0.01);
    if (!Number.isFinite(visibleScale) || visibleScale <= 0 || Math.abs(visibleScale - lastReportedScale) < 0.001) {
      return;
    }
    lastReportedScale = visibleScale;
    onVisibleScaleChange(visibleScale);
  }

  async function syncReplacedSvgViewport(generation: number): Promise<void> {
    const previousScrollLeft = previewPane?.scrollLeft ?? 0;
    const previousScrollTop = previewPane?.scrollTop ?? 0;
    await tick();
    if (generation !== svgViewportGeneration) return;
    reportVisibleScale();
    await tick();
    if (generation !== svgViewportGeneration || previewPane?.isConnected !== true || svgHost?.isConnected !== true) return;
    const maxScrollLeft = Math.max(0, svgHost.scrollWidth - previewPane.clientWidth);
    const maxScrollTop = Math.max(0, svgHost.scrollHeight - previewPane.clientHeight);
    previewPane.scrollLeft = Math.min(previousScrollLeft, maxScrollLeft);
    previewPane.scrollTop = Math.min(previousScrollTop, maxScrollTop);
  }

  function fittedScale(element: SVGSVGElement): number {
    const natural = naturalSvgSize(element);
    const rendered = element.getBoundingClientRect();
    if (natural.width <= 0 || natural.height <= 0 || rendered.width <= 0 || rendered.height <= 0) {
      return Math.max(scale, 0.01);
    }
    return Math.min(rendered.width / natural.width, rendered.height / natural.height);
  }

  function naturalSvgSize(element: SVGSVGElement): { width: number; height: number } {
    const viewBox = element.viewBox.baseVal;
    if (viewBox.width > 0 && viewBox.height > 0) {
      return { width: viewBox.width, height: viewBox.height };
    }
    const width = element.width.baseVal.value;
    const height = element.height.baseVal.value;
    if (width > 0 && height > 0) {
      return { width, height };
    }
    const box = element.getBBox();
    return { width: box.width, height: box.height };
  }

  function updateNaturalSize(element: SVGSVGElement): void {
    const natural = naturalSvgSize(element);
    if (natural.width > 0 && natural.height > 0) {
      naturalWidth = natural.width;
      naturalHeight = natural.height;
    }
  }

  function syncSvgClickHandler(): void {
    if (clickHandlerHost === svgHost) {
      return;
    }
    clickHandlerHost?.removeEventListener('click', handleSvgClick);
    clickHandlerHost = svgHost;
    clickHandlerHost?.addEventListener('click', handleSvgClick);
  }

  function handleSvgClick(event: MouseEvent): void {
    if (event.button !== 0) return;
    const elementId = diagramElementIdFromEvent(event);
    if (findPathMode.status === 'selecting-target' && elementId !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      const item = diagramElementMetadata(quickActionMetadata, elementId);
      if (item?.pathEligible === true && item.canonicalElementId !== findPathMode.sourceId) {
        onSelectPathTarget(elementId);
      }
      return;
    }

    const declaration = declarationFromEvent(event);
    if (declaration !== undefined) {
      event.preventDefault();
      onOpenDeclaration(declaration);
      return;
    }
    if (elementId === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectedElementId = selectedElementId === elementId ? undefined : elementId;
    syncDiagramNodeState();
  }

  function diagramElementIdFromEvent(event: MouseEvent): string | undefined {
    if (!(event.target instanceof Element)) return undefined;
    const eventElements = event.composedPath()
      .filter((candidate): candidate is Element => candidate instanceof Element);
    const candidates = eventElements.length > 0 ? eventElements : ancestorElements(event.target);
    for (const current of candidates) {
      if (current === svgHost) break;
      if (current instanceof SVGGElement && current.id.length > 0) {
        const identity = parseRenderIdentity(current.id);
        if (identity?.kind === 'node') {
          const elementId = identity.provenance[0];
          if (elementId !== undefined && diagramElementMetadata(quickActionMetadata, elementId) !== undefined) {
            return elementId;
          }
        }
      }
    }
    return undefined;
  }

  function ancestorElements(target: Element): Element[] {
    const elements: Element[] = [];
    let current: Element | null = target;
    while (current !== null) {
      elements.push(current);
      if (current === svgHost) break;
      current = current.parentElement;
    }
    return elements;
  }

  function syncDiagramNodeState(): void {
    if (!(svgHost instanceof Element)) return;
    for (const group of svgHost.querySelectorAll<SVGGElement>('g[id]')) {
      group.classList.remove(
        'archinsight-node-selected',
        'archinsight-path-source',
        'archinsight-path-target',
        'archinsight-path-compatible',
        'archinsight-path-incompatible'
      );
      const identity = parseRenderIdentity(group.id);
      if (identity === undefined || (identity.kind !== 'node' && identity.kind !== 'cluster')) continue;
      const elementId = identity.provenance[0];
      if (elementId === undefined || diagramElementMetadata(quickActionMetadata, elementId) === undefined) continue;
      const canonical = canonicalDiagramElementId(elementId);
      if ((findPathMode.status === 'idle' && selectedElementId === elementId)
          || (isolateMode.status === 'showing-isolate' && canonical === isolateMode.elementId)
          || (deploymentMode.status === 'showing-deployment'
            && deploymentMode.focusElementIds.includes(canonical))) {
        group.classList.add('archinsight-node-selected');
      }
      if (findPathMode.status !== 'idle' && canonical === findPathMode.sourceId) {
        group.classList.add('archinsight-path-source');
      }
      if ((findPathMode.status === 'resolving-path' || findPathMode.status === 'showing-path')
          && canonical === findPathMode.targetId) {
        group.classList.add('archinsight-path-target');
      }
      if (findPathMode.status === 'selecting-target') {
        const item = diagramElementMetadata(quickActionMetadata, elementId);
        group.classList.add(item?.pathEligible === true && canonical !== findPathMode.sourceId
          ? 'archinsight-path-compatible'
          : 'archinsight-path-incompatible');
      }
    }
  }

  function declarationFromEvent(event: MouseEvent): SourceLocation | undefined {
    if (!(event.target instanceof Element)) {
      return undefined;
    }
    const anchor = event.target.closest('a');
    if (anchor === null) {
      return undefined;
    }
    const href = anchor.getAttribute('href')
      ?? anchor.getAttribute('xlink:href')
      ?? anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (href === null || !href.startsWith('insight://goto?')) {
      return undefined;
    }
    try {
      const url = new URL(href);
      const source = url.searchParams.get('source');
      const line = Number(url.searchParams.get('line'));
      const column = Number(url.searchParams.get('column'));
      if (source === null || !Number.isFinite(line) || !Number.isFinite(column)) {
        return undefined;
      }
      return { source, line, column };
    } catch {
      return undefined;
    }
  }

</script>

<div
  bind:this={previewPane}
  class:fit
  class="preview-pane"
  style={`--diagram-width: ${diagramWidth}; --diagram-height: ${diagramHeight};`}
>
  {#if sanitizedSvg !== undefined}
    <div bind:this={svgHost} class="svg-host">{@html sanitizedSvg}</div>
  {/if}
  <DiagramQuickActions
    {previewPane}
    {svgHost}
    metadata={quickActionMetadata}
    {findPathMode}
    renderToken={sanitizedSvg}
    {deploymentEnvironments}
    {deploymentEnvironment}
    {deploymentPickerOpen}
    {deploymentPickerAnchor}
    {onSelectDeploymentEnvironment}
    {onCloseDeploymentPicker}
    onAction={onDiagramQuickAction}
  />
</div>

<style>
  .preview-pane {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--archinsight-preview-bg, #2e2e2e);
  }

  .svg-host {
    display: grid;
    place-items: center;
    min-width: 100%;
    min-height: 100%;
    padding: 16px;
    box-sizing: border-box;
  }

  .svg-host :global(svg) {
    display: block;
    width: var(--diagram-width);
    min-width: 0;
    height: var(--diagram-height);
    min-height: 0;
    max-width: none;
    max-height: none;
  }

  .svg-host :global(a[href^="insight://goto"]),
  .svg-host :global(a[xlink\:href^="insight://goto"]) {
    cursor: pointer;
  }

  .svg-host :global(g[id^="insight_node_"]),
  .svg-host :global(g[id^="cluster_insight_cluster_"]) {
    cursor: pointer;
  }

  .svg-host :global(g.archinsight-path-compatible) {
    cursor: crosshair;
  }

  .svg-host :global(g.archinsight-path-incompatible) {
    cursor: not-allowed;
  }

  .svg-host :global(g.archinsight-node-selected polygon),
  .svg-host :global(g.archinsight-node-selected ellipse),
  .svg-host :global(g.archinsight-node-selected path) {
    stroke: var(--color-primary, #6a9955) !important;
    stroke-width: 3px !important;
  }

  .svg-host :global(g.archinsight-path-source > polygon),
  .svg-host :global(g.archinsight-path-source > ellipse),
  .svg-host :global(g.archinsight-path-source > path) {
    stroke: #ff9800 !important;
    stroke-width: 4px !important;
  }

  .svg-host :global(g.archinsight-path-target > polygon),
  .svg-host :global(g.archinsight-path-target > ellipse),
  .svg-host :global(g.archinsight-path-target > path) {
    stroke: #ab47bc !important;
    stroke-width: 4px !important;
  }

  .preview-pane.fit {
    overflow: hidden;
  }

  .preview-pane.fit .svg-host {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
  }

  .preview-pane.fit .svg-host :global(svg) {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
  }
</style>
