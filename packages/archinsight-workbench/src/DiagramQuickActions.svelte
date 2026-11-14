<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import {
    canonicalDiagramElementId,
    diagramElementMetadata,
    parseRenderIdentity,
    type DiagramQuickActionMetadata
  } from '@insight/language';
  import {
    quickActionItems,
    type DiagramQuickActionAnchor,
    type DiagramQuickActionId,
    type FindPathMode
  } from './diagram-quick-actions';
  import DeploymentEnvironmentPicker from './DeploymentEnvironmentPicker.svelte';

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
  export let onSelectDeploymentEnvironment: (environment: string) => void = () => {};
  export let onCloseDeploymentPicker: () => void = () => {};
  export let onAction: (action: DiagramQuickActionId, elementId: string, anchor?: DiagramQuickActionAnchor) => void = () => {};

  let overlayHost: HTMLDivElement;
  let overlayWidth = '0px';
  let overlayHeight = '0px';
  let menuAnchor: MenuAnchor | undefined;
  let openElementId: string | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  let observedPreviewPane: HTMLDivElement | undefined;
  let observedSvgHost: HTMLDivElement | undefined;
  let observedSvg: SVGSVGElement | undefined;
  let scheduled = false;
  const triggerButtons = new Map<string, HTMLButtonElement>();

  $: openElement = openElementId === undefined ? undefined : diagramElementMetadata(metadata, openElementId);
  $: openItems = openElementId === undefined ? [] : quickActionItems(metadata, openElementId);
  $: deploymentPickerStyle = pickerStyle(deploymentPickerAnchor);
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
    removeTriggers();
  });

  function observeHosts(): void {
    const nextSvg = svgHost?.querySelector<SVGSVGElement>('svg') ?? undefined;
    if (observedPreviewPane === previewPane && observedSvgHost === svgHost && observedSvg === nextSvg) return;

    observedPreviewPane = previewPane;
    observedSvgHost = svgHost;
    observedSvg = nextSvg;

    resizeObserver?.disconnect();
    if (previewPane !== undefined) resizeObserver?.observe(previewPane);
    if (svgHost !== undefined) resizeObserver?.observe(svgHost);
    if (nextSvg !== undefined) resizeObserver?.observe(nextSvg);

    observeSvgMutations();
    scheduleTriggerSync();
  }

  function observeSvgMutations(): void {
    mutationObserver?.disconnect();
    if (svgHost !== undefined) mutationObserver?.observe(svgHost, { childList: true, subtree: true });
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
    removeTriggers();

    const svg = svgHost?.querySelector<SVGSVGElement>('svg');
    if (svg !== null && svg !== undefined) {
      for (const group of svg.querySelectorAll<SVGGElement>('g[id]')) {
        const identity = parseRenderIdentity(group.id);
        if (identity?.kind !== 'node') continue;
        const elementId = identity.provenance[0];
        if (elementId === undefined || triggerButtons.has(elementId)) continue;
        const item = diagramElementMetadata(metadata, elementId);
        if (item === undefined) continue;
        const box = safeBBox(group);
        if (box === undefined || box.width <= 0 || box.height <= 0) continue;
        const button = createTrigger(group, elementId, item.title, box);
        triggerButtons.set(elementId, button);
      }
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
    button.textContent = '✣';
    button.addEventListener('click', (event) => toggleMenu(event, elementId, button));
    host.append(button);
    group.append(host);
    return button;
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
    const anchor = action === 'show-deployment' ? actionAnchor(event.currentTarget) : undefined;
    closeMenu();
    if (anchor === undefined) onAction(action, elementId);
    else onAction(action, elementId, anchor);
  }

  function actionAnchor(target: EventTarget | null): DiagramQuickActionAnchor | undefined {
    if (!(target instanceof HTMLElement) || overlayHost === undefined) return undefined;
    const box = target.getBoundingClientRect();
    const parentBox = overlayHost.getBoundingClientRect();
    return {
      left: box.left - parentBox.left,
      top: box.top - parentBox.top,
      right: box.right - parentBox.left,
      bottom: box.bottom - parentBox.top
    };
  }

  function pickerStyle(anchor: DiagramQuickActionAnchor | undefined): string | undefined {
    if (anchor === undefined) return undefined;
    const pickerWidth = 280;
    const gap = 8;
    const margin = 8;
    let left = anchor.right + gap;
    if (left + pickerWidth > Number.parseFloat(overlayWidth) - margin) {
      left = anchor.left - pickerWidth - gap;
    }
    left = Math.max(margin, left);
    return `left: ${left}px; top: ${Math.max(margin, anchor.top)}px;`;
  }

  function anchorFor(button: HTMLButtonElement | undefined): MenuAnchor | undefined {
    if (overlayHost === undefined || button === undefined) return undefined;
    const buttonBox = button.getBoundingClientRect();
    const overlayBox = overlayHost.getBoundingClientRect();
    return {
      x: buttonBox.left + buttonBox.width / 2 - overlayBox.left,
      y: buttonBox.top + buttonBox.height / 2 - overlayBox.top
    };
  }

  function refreshLayout(): void {
    overlayWidth = `${Math.max(svgHost?.scrollWidth ?? 0, previewPane?.clientWidth ?? 0)}px`;
    overlayHeight = `${Math.max(svgHost?.scrollHeight ?? 0, previewPane?.clientHeight ?? 0)}px`;
    if (openElementId !== undefined) menuAnchor = anchorFor(triggerButtons.get(openElementId));
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
  aria-hidden={openElementId === undefined && !(deploymentPickerOpen && deploymentPickerAnchor !== undefined)}
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
          class={`radial-item radial-item-${index}`}
          type="button"
          role="menuitem"
          aria-label={item.enabled ? item.label : `${item.label}: ${item.disabledReason}`}
          aria-disabled={!item.enabled}
          on:click={(event) => execute(event, item.id, openElement.elementId)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <span class="radial-label">
            {item.enabled ? item.label : `${item.label}: ${item.disabledReason}`}
          </span>
        </button>
      {/each}
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
    border: 1px solid color-mix(in srgb, var(--archinsight-border-strong, #666) 75%, transparent);
    border-radius: 50%;
    background: var(--archinsight-control-bg, #333);
    color: var(--archinsight-foreground, #eee);
    font: 600 9px/1 system-ui, sans-serif;
    box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
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

  .radial-item-0 { margin: -48px 0 0 0; }
  .radial-item-1 { margin: 0 0 0 48px; }
  .radial-item-2 { margin: 48px 0 0 0; }
  .radial-item-3 { margin: 0 0 0 -48px; }

  .radial-label {
    position: absolute;
    left: 50%;
    top: calc(100% + 3px);
    padding: 2px 4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--archinsight-panel-bg, #252525) 94%, transparent);
    color: var(--archinsight-foreground, #eee);
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
