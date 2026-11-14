<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  export let environments: readonly { readonly id: string; readonly name?: string }[] = [];
  export let selectedEnvironment: string | undefined = undefined;
  export let onSelect: (environment: string) => void = () => {};
  export let onClose: () => void = () => {};

  let host: HTMLDivElement;
  let filter = '';
  let environmentSet = '';

  $: filteredEnvironments = environments.filter((environment) => {
    const value = filter.trim().toLocaleLowerCase();
    return value.length === 0
      || environment.id.toLocaleLowerCase().includes(value)
      || environment.name?.toLocaleLowerCase().includes(value) === true;
  });
  $: {
    const nextEnvironmentSet = environments.map((environment) => environment.id).join('\0');
    if (nextEnvironmentSet !== environmentSet) filter = '';
    environmentSet = nextEnvironmentSet;
  }

  onMount(() => {
    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('keydown', handleWindowKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('pointerdown', handleWindowPointerDown);
    window.removeEventListener('keydown', handleWindowKeydown);
  });

  function handleWindowPointerDown(event: PointerEvent): void {
    if (event.target instanceof Node && !host.contains(event.target)) onClose();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  }
</script>

<div bind:this={host} class="environment-picker" role="dialog" aria-label="Select deployment environment">
  {#if environments.length > 1}
    <input bind:value={filter} aria-label="Filter environments" placeholder="Filter environments" type="search" />
  {/if}
  <div class="environment-options" role="listbox">
    {#each filteredEnvironments as environment (environment.id)}
      <button
        aria-selected={environment.id === selectedEnvironment}
        class:selected={environment.id === selectedEnvironment}
        role="option"
        type="button"
        on:click={() => onSelect(environment.id)}
      >
        <span>{environment.id}</span>
        {#if environment.name !== undefined && environment.name !== environment.id}<small>{environment.name}</small>{/if}
      </button>
    {/each}
    {#if filteredEnvironments.length === 0}
      <div class="environment-empty">
        {environments.length === 0
          ? 'No deployment environments are relevant to this source'
          : 'No matching environments'}
      </div>
    {/if}
  </div>
  <button class="environment-close" type="button" on:click={onClose}>Cancel</button>
</div>

<style>
  .environment-picker {
    width: 280px;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid var(--archinsight-border, #454545);
    border-radius: 6px;
    background: var(--archinsight-toolbar-bg, #242424);
    color: var(--archinsight-foreground, #eeeeee);
    box-shadow: var(--archinsight-shadow, 0 10px 28px rgb(0 0 0 / 35%));
    pointer-events: auto;
  }

  input {
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

  .environment-options button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    height: auto;
    min-height: 38px;
    padding: 6px 8px;
    border: 0;
    border-radius: 4px;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 11px;
    text-align: left;
  }

  .environment-options button:hover,
  .environment-options button:focus-visible {
    background: var(--archinsight-control-hover-bg, #343434);
  }

  .environment-options button.selected {
    background: var(--archinsight-control-active-bg, #354436);
  }

  small {
    color: var(--archinsight-muted, #a8a8a8);
  }

  .environment-empty {
    padding: 10px 8px;
    color: var(--archinsight-muted, #a8a8a8);
    font-size: 12px;
  }

  .environment-close {
    width: 100%;
    height: 26px;
    margin-top: 6px;
    border: 0;
    border-radius: 4px;
    background: var(--archinsight-control-bg, #2a2a2a);
    color: var(--archinsight-foreground, #eeeeee);
    font-size: 11px;
  }

  .environment-close:hover,
  .environment-close:focus-visible {
    background: var(--archinsight-control-hover-bg, #343434);
  }
</style>
