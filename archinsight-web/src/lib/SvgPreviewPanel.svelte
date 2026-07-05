<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { sanitizeSvg } from './svg-sanitizer';
  import type { SourceLocation } from './workspace-types';

  export let svg: string | undefined;
  export let scale = 1;
  export let fit = false;
  export let onVisibleScaleChange: (scale: number) => void = () => {};
  export let onOpenDeclaration: (declaration: SourceLocation) => void = () => {};

  let previewPane: HTMLDivElement;
  let svgHost: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  let clickHandlerHost: HTMLDivElement | undefined;
  let lastReportedScale = Number.NaN;
  let naturalWidth = 0;
  let naturalHeight = 0;

  $: diagramWidth = naturalWidth > 0 ? `${naturalWidth * Math.max(scale, 0.01)}px` : 'auto';
  $: diagramHeight = naturalHeight > 0 ? `${naturalHeight * Math.max(scale, 0.01)}px` : 'auto';
  $: sanitizedSvg = sanitizeSvg(svg);

  onMount(() => {
    resizeObserver = new ResizeObserver(() => reportVisibleScale());
    if (previewPane !== undefined) {
      resizeObserver.observe(previewPane);
    }
    if (svgHost !== undefined) {
      resizeObserver.observe(svgHost);
    }
    reportVisibleScale();
  });

  afterUpdate(() => {
    syncSvgClickHandler();
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
    const declaration = declarationFromEvent(event);
    if (declaration === undefined) {
      return;
    }
    event.preventDefault();
    if (event.button !== 0) {
      return;
    }
    onOpenDeclaration(declaration);
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
</div>

<style>
  .preview-pane {
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
