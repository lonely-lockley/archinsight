<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import './overlay-picker.css';

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

<div bind:this={host} class="archinsight-picker environment-picker" role="dialog" aria-label="Select deployment environment">
  {#if environments.length > 1}
    <input class="archinsight-picker__control environment-filter" bind:value={filter} aria-label="Filter environments" placeholder="Filter environments" type="search" />
  {/if}
  <div class="archinsight-picker__options environment-options" role="listbox">
    {#each filteredEnvironments as environment (environment.id)}
      <button
        aria-selected={environment.id === selectedEnvironment}
        class="archinsight-picker__option"
        class:archinsight-picker__option--selected={environment.id === selectedEnvironment}
        role="option"
        type="button"
        on:click={() => onSelect(environment.id)}
      >
        <span>{environment.id}</span>
        {#if environment.name !== undefined && environment.name !== environment.id}<small class="archinsight-picker__muted">{environment.name}</small>{/if}
      </button>
    {/each}
    {#if filteredEnvironments.length === 0}
      <div class="archinsight-picker__message environment-empty">
        {environments.length === 0
          ? 'No deployment environments are relevant to this source'
          : 'No matching environments'}
      </div>
    {/if}
  </div>
  <div class="archinsight-picker__footer">
    <button class="archinsight-picker__button environment-close" type="button" on:click={onClose}>Cancel</button>
  </div>
</div>

<style>
  .environment-filter {
    margin-bottom: 6px;
  }
</style>
