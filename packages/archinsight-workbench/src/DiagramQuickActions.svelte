<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import {
    canonicalDiagramElementId,
    diagramElementMetadata,
    parseRenderIdentity,
    type DiagramQuickActionMetadata
  } from '@insight/language';
  import {
    quickActionRadialOffsets,
    quickActionItems,
    type DiagramQuickActionAnchor,
    type DiagramQuickActionId,
    type DiagramQuickActionItem,
    type DiagramQuickActionViewport,
    type FindPathMode
  } from './diagram-quick-actions';
  import DeploymentEnvironmentPicker from './DeploymentEnvironmentPicker.svelte';
  import DiagramDiffRevisionPicker from './DiagramDiffRevisionPicker.svelte';
  import type { DiagramDiffPickerState } from './versioned-diagram-diff';

  type MenuAnchor = { x: number; y: number };

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const triggerSize = 16;

  export let previewPane: HTMLDivElement | undefined;
  export let svgHost: HTMLDivElement | undefined;
  export let metadata: DiagramQuickActionMetadata = {};
  export let findPathMode: FindPathMode = { status: 'idle' };
  export let renderToken: string | undefined;
  export let deploymentEnvironments: readonly { readonly id: string; readonly name?: string }[] = [];
  export let deploymentEnvironment: string | undefined = undefined;
  export let deploymentPickerOpen = false;
  export let deploymentPickerAnchor: DiagramQuickActionAnchor | undefined = undefined;
  export let versioningAvailable = false;
  export let declarationNavigationAvailable = true;
  export let diffPickerState: DiagramDiffPickerState = { status: 'closed' };
  export let diffPickerAnchor: DiagramQuickActionAnchor | undefined = undefined;
  export let onSelectDeploymentEnvironment: (environment: string) => void = () => {};
  export let onCloseDeploymentPicker: () => void = () => {};
  export let onSelectDiffRevision: (side: 'before' | 'after', revision: string) => void = () => {};
  export let onCompareDiff: () => void = () => {};
  export let onCloseDiffPicker: () => void = () => {};
  export let onAction: (action: DiagramQuickActionId, elementId: string, anchor?: DiagramQuickActionAnchor) => void = () => {};

  let overlayHost: HTMLDivElement;
  let overlayWidth = '0px';
  let overlayHeight = '0px';
  let menuAnchor: MenuAnchor | undefined;
  let openItemOffsets: readonly { readonly x: number; readonly y: number }[] = [];
  let viewportBounds: DiagramQuickActionViewport | undefined;
  let openElementId: string | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  let observedPreviewPane: HTMLDivElement | undefined;
  let observedSvgHost: HTMLDivElement | undefined;
  let observedSvg: SVGSVGElement | undefined;
  let scheduled = false;
  const triggerButtons = new Map<string, HTMLButtonElement>();

  $: openElement = openElementId === undefined ? undefined : diagramElementMetadata(metadata, openElementId);
  $: openItems = openElementId === undefined ? [] : quickActionItems(metadata, openElementId, {
    versioning: versioningAvailable,
    declarationNavigation: declarationNavigationAvailable
  });
  $: deploymentPickerStyle = pickerStyle(deploymentPickerAnchor);
  $: diffPickerStyle = pickerStyle(diffPickerAnchor, 360);
  $: openItemOffsets = menuAnchor === undefined || viewportBounds === undefined
    ? []
    : quickActionRadialOffsets(openItems.length, menuAnchor, viewportBounds);
  $: {
    void metadata;
    void findPathMode;
    void renderToken;
    scheduleTriggerSync();
  }

  onMount(() => {
    resizeObserver = new ResizeObserver(refreshLayout);
    mutationObserver = new MutationObserver(() => {
      observeHosts();
      scheduleTriggerSync();
    });
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('pointerdown', handleOutsidePointer, true);
    observeHosts();
    scheduleTriggerSync();
  });

  afterUpdate(observeHosts);

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('pointerdown', handleOutsidePointer, true);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    observedPreviewPane?.removeEventListener('scroll', refreshLayout);
    observedSvgHost?.removeEventListener('click', handleTriggerClick, true);
    removeTriggers();
  });

  function observeHosts(): void {
    const nextSvg = svgHost?.querySelector<SVGSVGElement>('svg') ?? undefined;
    if (observedPreviewPane === previewPane && observedSvgHost === svgHost && observedSvg === nextSvg) return;

    observedPreviewPane?.removeEventListener('scroll', refreshLayout);
    observedSvgHost?.removeEventListener('click', handleTriggerClick, true);
    observedPreviewPane = previewPane;
    observedSvgHost = svgHost;
    observedSvg = nextSvg;

    resizeObserver?.disconnect();
    if (previewPane instanceof Element) resizeObserver?.observe(previewPane);
    previewPane?.addEventListener('scroll', refreshLayout, { passive: true });
    svgHost?.addEventListener('click', handleTriggerClick, true);
    if (svgHost instanceof Element) resizeObserver?.observe(svgHost);
    if (nextSvg instanceof Element) resizeObserver?.observe(nextSvg);

    observeSvgMutations();
    scheduleTriggerSync();
  }

  function observeSvgMutations(): void {
    mutationObserver?.disconnect();
    if (svgHost instanceof Node) mutationObserver?.observe(svgHost, { childList: true, subtree: true });
  }

  function scheduleTriggerSync(): void {
    if (scheduled) return;
    scheduled = true;
    void tick().then(() => {
      scheduled = false;
      syncTriggers();
    });
  }

  function syncTriggers(): void {
    mutationObserver?.disconnect();
    const retained = new Set<string>();

    const svg = svgHost?.querySelector<SVGSVGElement>('svg');
    if (svg !== null && svg !== undefined) {
      for (const group of svg.querySelectorAll<SVGGElement>('g[id]')) {
        const identity = parseRenderIdentity(group.id);
        if (identity?.kind !== 'node') continue;
        const elementId = identity.provenance[0];
        if (elementId === undefined || retained.has(elementId)) continue;
        const item = diagramElementMetadata(metadata, elementId);
        if (item === undefined) continue;
        const box = safeBBox(group);
        if (box === undefined || box.width <= 0 || box.height <= 0) continue;
        const existing = triggerButtons.get(elementId);
        if (existing === undefined || !existing.isConnected || existing.closest('g') !== group) {
          existing?.closest('[data-diagram-quick-action-host]')?.remove();
          triggerButtons.set(elementId, createTrigger(group, elementId, item.title, box));
        } else {
          updateTrigger(existing, elementId, item.title, box);
        }
        retained.add(elementId);
      }
    }

    for (const [elementId, button] of triggerButtons) {
      if (retained.has(elementId)) continue;
      button.closest('[data-diagram-quick-action-host]')?.remove();
      triggerButtons.delete(elementId);
    }

    if (openElementId !== undefined && !triggerButtons.has(openElementId)) closeMenu();
    observeSvgMutations();
    refreshLayout();
  }

  function safeBBox(group: SVGGElement): DOMRect | undefined {
    try {
      return group.getBBox();
    } catch {
      return undefined;
    }
  }

  function createTrigger(
    group: SVGGElement,
    elementId: string,
    title: string,
    box: DOMRect
  ): HTMLButtonElement {
    const host = document.createElementNS(svgNamespace, 'foreignObject');
    host.classList.add('archinsight-quick-action-host');
    host.setAttribute('data-diagram-quick-action-host', '');
    host.setAttribute('x', String(box.x + box.width - triggerSize));
    host.setAttribute('y', String(box.y));
    host.setAttribute('width', String(triggerSize));
    host.setAttribute('height', String(triggerSize));

    const button = document.createElement('button');
    button.className = 'archinsight-quick-action-trigger';
    if (findPathMode.status !== 'idle'
        && canonicalDiagramElementId(elementId) === findPathMode.sourceId) {
      button.classList.add('source');
    }
    button.type = 'button';
    button.setAttribute('aria-label', `Quick actions for ${title}`);
    button.setAttribute('aria-expanded', String(openElementId === elementId));
    button.setAttribute('data-diagram-quick-actions', '');
    button.setAttribute('data-diagram-element-id', elementId);
    button.textContent = '✣';
    host.append(button);
    group.append(host);
    return button;
  }

  function updateTrigger(button: HTMLButtonElement, elementId: string, title: string, box: DOMRect): void {
    const host = button.closest('[data-diagram-quick-action-host]');
    host?.setAttribute('x', String(box.x + box.width - triggerSize));
    host?.setAttribute('y', String(box.y));
    button.setAttribute('aria-label', `Quick actions for ${title}`);
    button.setAttribute('aria-expanded', String(openElementId === elementId));
    button.classList.toggle(
      'source',
      findPathMode.status !== 'idle' && canonicalDiagramElementId(elementId) === findPathMode.sourceId
    );
  }

  function handleTriggerClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-diagram-element-id]')
      : null;
    const elementId = target?.getAttribute('data-diagram-element-id');
    if (target === null || elementId === null) return;
    toggleMenu(event, elementId, target);
  }

  function removeTriggers(): void {
    for (const host of svgHost?.querySelectorAll('[data-diagram-quick-action-host]') ?? []) host.remove();
    triggerButtons.clear();
  }

  function toggleMenu(event: MouseEvent, elementId: string, button: HTMLButtonElement): void {
    event.preventDefault();
    event.stopPropagation();
    const next = openElementId === elementId ? undefined : elementId;
    setOpenElement(next);
    menuAnchor = next === undefined ? undefined : anchorFor(button);
  }

  function setOpenElement(elementId: string | undefined): void {
    openElementId = elementId;
    for (const [candidateId, button] of triggerButtons) {
      button.setAttribute('aria-expanded', String(candidateId === elementId));
    }
  }

  function closeMenu(): void {
    setOpenElement(undefined);
    menuAnchor = undefined;
  }

  function execute(event: MouseEvent, action: DiagramQuickActionId, elementId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const item = openItems.find((candidate) => candidate.id === action);
    if (item?.enabled !== true) return;
    const anchor = action === 'show-deployment' || action === 'diff' ? actionAnchor(event.currentTarget) : undefined;
    closeMenu();
    if (anchor === undefined) onAction(action, elementId);
    else onAction(action, elementId, anchor);
  }

  function actionAnchor(target: EventTarget | null): DiagramQuickActionAnchor | undefined {
    if (!(target instanceof HTMLElement) || !(overlayHost instanceof Element)) return undefined;
    const box = target.getBoundingClientRect();
    const parentBox = overlayHost.getBoundingClientRect();
    return {
      left: box.left - parentBox.left,
      top: box.top - parentBox.top,
      right: box.right - parentBox.left,
      bottom: box.bottom - parentBox.top
    };
  }

  function pickerStyle(anchor: DiagramQuickActionAnchor | undefined, pickerWidth = 280): string | undefined {
    if (anchor === undefined) return undefined;
    const gap = 8;
    const margin = 8;
    const viewport = viewportBounds ?? {
      left: 0,
      top: 0,
      right: Number.parseFloat(overlayWidth),
      bottom: Number.parseFloat(overlayHeight)
    };
    let left = anchor.right + gap;
    if (left + pickerWidth > viewport.right - margin) {
      left = anchor.left - pickerWidth - gap;
    }
    const minimumLeft = viewport.left + margin;
    const maximumLeft = Math.max(minimumLeft, viewport.right - margin - pickerWidth);
    left = Math.min(maximumLeft, Math.max(minimumLeft, left));
    return `left: ${left}px; top: ${Math.max(viewport.top + margin, anchor.top)}px;`;
  }

  function actionHint(item: DiagramQuickActionItem): string {
    return item.enabled || item.disabledReason === undefined
      ? item.label
      : `${item.label}: ${item.disabledReason}`;
  }

  function anchorFor(button: HTMLButtonElement | undefined): MenuAnchor | undefined {
    if (!(overlayHost instanceof Element) || button === undefined) return undefined;
    const buttonBox = button.getBoundingClientRect();
    const overlayBox = overlayHost.getBoundingClientRect();
    return {
      x: buttonBox.left + buttonBox.width / 2 - overlayBox.left,
      y: buttonBox.top + buttonBox.height / 2 - overlayBox.top
    };
  }

  function refreshLayout(): void {
    const width = Math.max(svgHost?.scrollWidth ?? 0, previewPane?.clientWidth ?? 0);
    const height = Math.max(svgHost?.scrollHeight ?? 0, previewPane?.clientHeight ?? 0);
    overlayWidth = `${width}px`;
    overlayHeight = `${height}px`;
    viewportBounds = visibleViewport(width, height);
    if (openElementId !== undefined) menuAnchor = anchorFor(triggerButtons.get(openElementId));
  }

  function visibleViewport(width: number, height: number): DiagramQuickActionViewport {
    if (!(overlayHost instanceof Element) || !(previewPane instanceof Element)) {
      return { left: 0, top: 0, right: width, bottom: height };
    }
    const overlayBox = overlayHost.getBoundingClientRect();
    const previewBox = previewPane.getBoundingClientRect();
    const left = Math.max(0, previewBox.left - overlayBox.left);
    const top = Math.max(0, previewBox.top - overlayBox.top);
    return {
      left,
      top,
      right: Math.max(left, Math.min(width, previewBox.right - overlayBox.left)),
      bottom: Math.max(top, Math.min(height, previewBox.bottom - overlayBox.top))
    };
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || openElementId === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
  }

  function handleOutsidePointer(event: PointerEvent): void {
    if (openElementId === undefined || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-diagram-quick-actions]') === null) closeMenu();
  }
</script>

<div
  bind:this={overlayHost}
  class="quick-actions-overlay"
  style={`width: ${overlayWidth}; height: ${overlayHeight};`}
  aria-hidden={openElementId === undefined
    && !(deploymentPickerOpen && deploymentPickerAnchor !== undefined)
    && !(diffPickerState.status !== 'closed' && diffPickerAnchor !== undefined)}
>
  {#if openElement !== undefined && menuAnchor !== undefined}
    <div
      class="radial-menu"
      role="menu"
      aria-label={`Quick actions for ${openElement.title}`}
      data-diagram-quick-actions
      data-diagram-quick-actions-menu
      style={`left: ${menuAnchor.x}px; top: ${menuAnchor.y}px;`}
    >
      {#each openItems as item, index (item.id)}
        <button
          class="radial-item"
          style={`margin-left: ${openItemOffsets[index]?.x ?? 0}px; margin-top: ${openItemOffsets[index]?.y ?? 0}px;`}
          type="button"
          role="menuitem"
          aria-label={actionHint(item)}
          aria-disabled={!item.enabled}
          on:click={(event) => execute(event, item.id, openElement.elementId)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <span class="radial-label">
            {actionHint(item)}
          </span>
        </button>
      {/each}
    </div>
  {/if}
  {#if diffPickerState.status !== 'closed' && diffPickerAnchor !== undefined && diffPickerStyle !== undefined}
    <div class="deployment-picker-position" style={diffPickerStyle}>
      <DiagramDiffRevisionPicker
        state={diffPickerState}
        onSelect={onSelectDiffRevision}
        onCompare={onCompareDiff}
        onClose={onCloseDiffPicker}
      />
    </div>
  {/if}
  {#if deploymentPickerOpen && deploymentPickerAnchor !== undefined && deploymentPickerStyle !== undefined}
    <div class="deployment-picker-position" style={deploymentPickerStyle}>
      <DeploymentEnvironmentPicker
        environments={deploymentEnvironments}
        selectedEnvironment={deploymentEnvironment}
        onSelect={onSelectDeploymentEnvironment}
        onClose={onCloseDeploymentPicker}
      />
    </div>
  {/if}
</div>

<style>
  .quick-actions-overlay {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 6;
    pointer-events: none;
  }

  :global(.archinsight-quick-action-host) {
    overflow: visible;
    pointer-events: all;
  }

  :global(.archinsight-quick-action-trigger),
  .radial-item {
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--archinsight-quick-action-border, #666);
    border-radius: 50%;
    background: var(--archinsight-quick-action-bg, #2b2b2b);
    color: var(--archinsight-quick-action-fg, #f2f2f2);
    font: 600 9px/1 system-ui, sans-serif;
    box-shadow: var(--archinsight-quick-action-shadow, 0 2px 6px rgb(0 0 0 / 35%));
    cursor: pointer;
    pointer-events: auto;
  }

  :global(.archinsight-quick-action-trigger) {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  :global(.archinsight-quick-action-trigger:hover),
  :global(.archinsight-quick-action-trigger:focus-visible),
  .radial-item:hover:not([aria-disabled='true']),
  .radial-item:focus-visible {
    border-color: var(--color-primary, #6a9955);
    outline: 2px solid color-mix(in srgb, var(--color-primary, #6a9955) 45%, transparent);
    outline-offset: 1px;
  }

  :global(.archinsight-quick-action-trigger.source) {
    border-color: #ff9800;
    color: #ffb74d;
  }

  .radial-menu {
    position: absolute;
    z-index: 7;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .deployment-picker-position {
    position: absolute;
    z-index: 8;
    pointer-events: auto;
  }

  .radial-item {
    position: absolute;
    width: 34px;
    height: 34px;
    font-size: 16px;
    transform: translate(-50%, -50%);
  }

  .radial-item[aria-disabled='true'] {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .radial-label {
    position: absolute;
    left: 50%;
    top: calc(100% + 3px);
    padding: 2px 4px;
    border-radius: 3px;
    background: var(--archinsight-quick-action-bg, #2b2b2b);
    color: var(--archinsight-quick-action-fg, #f2f2f2);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.1;
    white-space: nowrap;
    transform: translateX(-50%);
    opacity: 0;
    pointer-events: none;
  }

  .radial-item:hover .radial-label,
  .radial-item:focus-visible .radial-label {
    opacity: 1;
  }
</style>
