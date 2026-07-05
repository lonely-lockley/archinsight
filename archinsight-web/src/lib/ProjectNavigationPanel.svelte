<script lang="ts">
  import type { LanguageSnapshot } from '@insight/language';
  import FileTreeNode from './FileTreeNode.svelte';
  import StructurePanel from './StructurePanel.svelte';
  import type { ProjectStructure } from './api';
  import type { ProjectUiState, SourceLocation, TreeNode } from './workspace-types';

  export let tree: TreeNode | undefined;
  export let hasActiveProject = true;
  export let symbols: LanguageSnapshot;
  export let structure: ProjectStructure | undefined;
  export let activePath: string | undefined;
  export let errorPaths: Set<string> = new Set();
  export let ui: ProjectUiState;
  export let visible: boolean;
  export let onOpen: (path: string) => void;
  export let onRepositoryContextMenu: (node: TreeNode, event: MouseEvent) => void;
  export let onOpenDeclaration: (declaration: SourceLocation) => void;
  export let onShowSidebar: () => void;
  export let onToggleSidebar: () => void;
  export let onToggleMessages: () => void;
  export let onBeginSidebarResize: (event: PointerEvent) => void;

  let activePanel: 'repository' | 'structure' = 'repository';

  function showPanel(panel: 'repository' | 'structure'): void {
    activePanel = panel;
    onShowSidebar();
  }
</script>

<aside class:collapsed={!visible} class="sidebar">
  {#if visible}
    <div class="brand">
      <img class="brand-logo" src="/archinsight-logo-no-background.svg" alt="" aria-hidden="true" />
      <div>Archinsight</div>
    </div>
    <div class="panel-tabs">
      <button class:active={activePanel === 'repository'} type="button" on:click={() => activePanel = 'repository'}>
        <span aria-hidden="true" class="codicon codicon-list-tree"></span>
        <span>Repository</span>
      </button>
      <button class:active={activePanel === 'structure'} type="button" on:click={() => activePanel = 'structure'}>
        <span aria-hidden="true" class="codicon codicon-symbol-structure"></span>
        <span>Structure</span>
      </button>
    </div>
    <section class="panel-body">
      {#if activePanel === 'repository'}
        {#if !hasActiveProject}
          <div class="empty">No active project</div>
        {:else if tree}
          <div class="tree">
            <FileTreeNode node={tree} activePath={activePath} {errorPaths} onOpen={onOpen} onContextMenu={onRepositoryContextMenu} />
          </div>
        {:else}
          <div class="empty">Loading</div>
        {/if}
      {:else}
        <StructurePanel {symbols} {structure} {onOpenDeclaration} />
      {/if}
    </section>
    <div class="sidebar-controls" aria-label="Panel controls">
      <button aria-label={ui.messagesVisible ? 'Hide messages' : 'Show messages'} class:active-tool={ui.messagesVisible} class="icon-button has-tooltip tooltip-top" data-tooltip={ui.messagesVisible ? 'Hide messages' : 'Show messages'} type="button" on:click={onToggleMessages}>
        <span aria-hidden="true" class:show-panel={!ui.messagesVisible} class:hide-panel={ui.messagesVisible} class="panel-toggle-icon bottom-panel-icon"></span>
      </button>
      <button aria-label="Hide panel" class="icon-button has-tooltip tooltip-top" data-tooltip="Hide panel" type="button" on:click={onToggleSidebar}>
        <span aria-hidden="true" class="panel-toggle-icon sidebar-panel-icon hide-panel"></span>
      </button>
    </div>
    <div
      class="sidebar-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      on:pointerdown={onBeginSidebarResize}
    ></div>
  {:else}
    <div class="collapsed-rail" aria-label="Collapsed sidebar">
      <button aria-label="Show panel" class="rail-brand has-tooltip tooltip-right" data-tooltip="Show panel" type="button" on:click={onShowSidebar}>
        <img class="rail-logo" src="/archinsight-logo-no-background.svg" alt="" aria-hidden="true" />
      </button>
      <button aria-label="Repository" class:active={activePanel === 'repository'} class="rail-tab has-tooltip tooltip-right" data-tooltip="Repository" type="button" on:click={() => showPanel('repository')}>
        <span aria-hidden="true" class="codicon codicon-list-tree"></span>
      </button>
      <button aria-label="Structure" class:active={activePanel === 'structure'} class="rail-tab has-tooltip tooltip-right" data-tooltip="Structure" type="button" on:click={() => showPanel('structure')}>
        <span aria-hidden="true" class="codicon codicon-symbol-structure"></span>
      </button>
      <div class="rail-spacer"></div>
      <button aria-label={ui.messagesVisible ? 'Hide messages' : 'Show messages'} class:active-tool={ui.messagesVisible} class="rail-button has-tooltip tooltip-right" data-tooltip={ui.messagesVisible ? 'Hide messages' : 'Show messages'} type="button" on:click={onToggleMessages}>
        <span aria-hidden="true" class:show-panel={!ui.messagesVisible} class:hide-panel={ui.messagesVisible} class="panel-toggle-icon bottom-panel-icon"></span>
      </button>
      <button aria-label="Show panel" class="rail-button has-tooltip tooltip-right" data-tooltip="Show panel" type="button" on:click={onShowSidebar}>
        <span aria-hidden="true" class="panel-toggle-icon sidebar-panel-icon show-panel"></span>
      </button>
    </div>
  {/if}
</aside>

<style>
  .codicon-list-tree::before {
    content: "\eb86";
  }

  .codicon-symbol-structure::before {
    content: "\ea91";
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    line-height: 1;
  }

  .panel-toggle-icon {
    position: relative;
    display: inline-block;
    width: 18px;
    height: 18px;
    color: currentColor;
  }

  .panel-toggle-icon::before {
    position: absolute;
    inset: 2px;
    border: 1.8px solid currentColor;
    border-radius: 2px;
    content: "";
    opacity: 0.9;
  }

  .panel-toggle-icon::after {
    position: absolute;
    inset: 0;
    content: "";
    display: grid;
    place-items: center;
    font-family: codicon;
    font-size: 15px;
    font-weight: 400;
    line-height: 1;
  }

  .sidebar-panel-icon::before {
    box-shadow: inset 5px 0 0 color-mix(in srgb, currentColor 32%, transparent);
  }

  .sidebar-panel-icon.hide-panel::after {
    content: "\eab5";
  }

  .sidebar-panel-icon.show-panel::after {
    content: "\eab6";
  }

  .bottom-panel-icon::before {
    box-shadow: inset 0 -5px 0 color-mix(in srgb, currentColor 32%, transparent);
  }

  .bottom-panel-icon.hide-panel::after {
    content: "\eab4";
  }

  .bottom-panel-icon.show-panel::after {
    content: "\eab7";
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
    border: 1px solid #444444;
    border-radius: 4px;
    background: #181818;
    color: #eeeeee;
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

  .has-tooltip.tooltip-right::after {
    top: 50%;
    left: calc(100% + 10px);
    transform: translate(0, -50%);
  }

  .has-tooltip.tooltip-right:hover::after,
  .has-tooltip.tooltip-right:focus-visible::after {
    transform: translate(0, -50%);
  }

  .has-tooltip.tooltip-top::after {
    top: auto;
    bottom: calc(100% + 8px);
    transform: translate(-50%, 2px);
  }

  .has-tooltip.tooltip-top:hover::after,
  .has-tooltip.tooltip-top:focus-visible::after {
    transform: translate(-50%, 0);
  }

  .sidebar {
    display: grid;
    position: relative;
    grid-template-rows: 58px 46px 1fr 48px;
    height: 100%;
    min-height: 0;
    min-width: 0;
    border-right: 1px solid #3a3a3a;
    background: #212121;
  }

  .sidebar.collapsed {
    grid-template-rows: 1fr;
    overflow: visible;
    z-index: 8;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    color: var(--color-primary);
    font-family: var(--app-primary-font-family);
    font-weight: 700;
  }

  .brand-logo {
    display: block;
    width: 28px;
    height: 29px;
    flex: 0 0 auto;
  }

  .panel-tabs {
    display: flex;
    gap: 8px;
    align-items: end;
    padding: 0 18px;
    border-bottom: 1px solid #333333;
  }

  .panel-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 2px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    color: #a5a5a5;
    font-size: 14px;
  }

  .panel-tabs button.active {
    border-bottom-color: var(--color-primary);
    color: #ffffff;
  }

  .panel-body {
    display: grid;
    min-height: 0;
    overflow: hidden;
  }

  .empty {
    align-self: start;
    padding: 14px 16px;
    color: #9d9d9d;
    font-size: 13px;
  }

  .tree {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding-top: 8px;
  }

  .sidebar-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
    padding: 7px 10px;
    border-top: 1px solid #333333;
    background: #242424;
  }

  .sidebar-controls button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border: 0;
    border-radius: 4px;
    background: #2d2d2d;
    color: #dddddd;
    font-size: 16px;
  }

  .sidebar-controls button:hover,
  .sidebar-controls button.active-tool {
    background: #354436;
    color: #ffffff;
  }

  .sidebar-resize {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 4;
  }

  .sidebar-resize:hover {
    background: color-mix(in srgb, var(--color-primary) 27%, transparent);
  }

  .collapsed-rail {
    display: grid;
    grid-template-rows: 52px auto auto 1fr auto auto;
    align-items: center;
    justify-items: center;
    gap: 10px;
    width: 100%;
    min-height: 0;
    padding: 8px 0;
    border-right: 1px solid #303030;
    background: #202020;
  }

  .rail-brand,
  .rail-tab,
  .rail-button {
    border: 0;
    background: transparent;
    color: #bdbdbd;
  }

  .rail-brand {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 4px;
  }

  .rail-logo {
    display: block;
    width: 26px;
    height: 27px;
  }

  .rail-tab,
  .rail-button {
    width: 100%;
    min-height: 44px;
    padding: 8px 0;
    font-size: 17px;
  }

  .rail-tab.active,
  .rail-button.active-tool {
    color: #ffffff;
    box-shadow: inset 3px 0 0 var(--color-primary);
  }

  .rail-tab:hover,
  .rail-button:hover {
    background: #2d2d2d;
    color: #ffffff;
  }

  .rail-spacer {
    min-height: 0;
  }

  .empty {
    padding: 24px;
    color: #9a9a9a;
  }
</style>
