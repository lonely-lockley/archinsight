<script lang="ts">
  import type { WorkspaceTab } from '$lib/workspace-types';

  export let tabs: readonly WorkspaceTab[];
  export let activeTabId: string | undefined;
  export let errorSourceIdentities: ReadonlySet<string>;
  export let rightPadding: number;
  export let onActivate: (tabId: string) => void;
  export let onClose: (tabId: string) => void;

  function tabTitle(tab: WorkspaceTab): string {
    return tab.readOnly === true ? `[r] ${tab.title}` : tab.title;
  }
</script>

<section class="tabs" style={`padding-right: ${rightPadding}px;`}>
  {#each tabs as tab (tab.id)}
    <div
      class:active={tab.id === activeTabId}
      class:error-tab={errorSourceIdentities.has(tab.sourceIdentity)}
      class="tab"
    >
      <button class="tab-main" type="button" on:click={() => onActivate(tab.id)}>
        <span class="tab-title"><span class="tab-title-text">{tabTitle(tab)}</span></span>
        {#if tab.local}<span class="dirty">•</span>{/if}
      </button>
      <button
        aria-label={`Close ${tab.title}`}
        class="close has-tooltip"
        data-tooltip={`Close ${tab.title}`}
        type="button"
        on:click={() => onClose(tab.id)}
      >
        <span aria-hidden="true" class="codicon codicon-close"></span>
      </button>
    </div>
  {/each}
</section>

<style>
  .codicon-close::before {
    content: "\ea76";
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

  .tabs {
    display: flex;
    min-width: 0;
    overflow: auto hidden;
    border-bottom: 1px solid #393939;
    background: #2b2b2b;
  }

  .tab {
    display: flex;
    align-items: center;
    min-width: 118px;
    max-width: 190px;
    height: 100%;
    border-right: 1px solid #3a3a3a;
    border-bottom: 2px solid transparent;
    background: #2d2d2d;
    color: #d8d8d8;
  }

  .tab.active {
    border-bottom-color: var(--color-primary);
    background: #303030;
    color: #ffffff;
  }

  .tab-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    flex: 1;
    padding: 0 6px 0 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 12px;
  }

  .tab-title {
    position: relative;
    min-width: 0;
    overflow: visible;
  }

  .tab-title-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-tab .tab-title::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 8px;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 4 C1 2 3 2 4 4 C5 6 7 6 8 4' fill='none' stroke='%23ff5c57' stroke-width='1.3'/%3E%3C/svg%3E");
    background-repeat: repeat-x;
    background-position: left center;
    background-size: 8px 8px;
  }

  .dirty {
    color: var(--color-primary);
  }

  .close {
    width: 28px;
    height: 100%;
    border: 0;
    background: transparent;
    color: #b5b5b5;
  }

  .close .codicon {
    font-size: 13px;
  }

  .close:hover {
    color: #ffffff;
    background: #3a3a3a;
  }
</style>

