<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { loadTechnologyIconSvg, searchTechnologyIcons, type TechnologyIconEntry } from '@archinsight/icons';
  import './overlay-picker.css';

  export let initialQuery = '';
  export let onSelect: (iconId: string) => void = () => {};
  export let onClose: () => void = () => {};

  let host: HTMLDivElement | undefined;
  let filter = initialQuery;
  let results: readonly TechnologyIconEntry[] = [];
  let showNone = true;
  let previews: Readonly<Record<string, string>> = {};
  let activeIndex = 0;

  $: update(filter);

  onMount(() => {
    void tick().then(() => host?.querySelector<HTMLInputElement>('input')?.focus());
  });

  function update(value: string): void {
    results = searchTechnologyIcons(value, 50);
    const normalized = value.trim().toLocaleLowerCase();
    showNone = normalized.length === 0 || 'none'.includes(normalized);
    activeIndex = results.length === 0 && !showNone ? -1 : 0;
  }

  function choiceId(index: number): string | undefined {
    if (showNone && index === 0) return 'none';
    return results[index - (showNone ? 1 : 0)]?.id;
  }

  function observePreview(node: HTMLElement, iconId: string): { destroy(): void } {
    const load = async (): Promise<void> => {
      if (previews[iconId] !== undefined) return;
      const svg = await loadTechnologyIconSvg(iconId);
      if (svg !== undefined) previews = { ...previews, [iconId]: svg };
    };
    if (typeof IntersectionObserver === 'undefined') {
      void load();
      return { destroy() {} };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        observer.disconnect();
        void load();
      }
    }, { root: host?.querySelector('.icon-options') ?? null });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  async function focusActive(): Promise<void> {
    await tick();
    host?.querySelector<HTMLButtonElement>(`[data-icon-index="${activeIndex}"]`)?.focus();
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!host?.contains(document.activeElement)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      const count = results.length + (showNone ? 1 : 0);
      if (count === 0) return;
      event.preventDefault();
      activeIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? count - 1
          : event.key === 'ArrowDown' ? (activeIndex + 1 + count) % count
            : (activeIndex - 1 + count) % count;
      void focusActive();
      return;
    }
    if (event.key === 'Enter' && document.activeElement?.tagName === 'INPUT' && activeIndex >= 0) {
      event.preventDefault();
      const selected = choiceId(activeIndex);
      if (selected !== undefined) onSelect(selected);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(host?.querySelectorAll<HTMLElement>('input, button') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window on:keydown={keydown} />

<div class="icon-picker-backdrop" role="presentation">
  <div bind:this={host} class="archinsight-picker icon-picker" role="dialog" aria-label="Select technology icon" aria-modal="true">
    <strong class="archinsight-picker__title">Select technology icon</strong>
    <small class="archinsight-picker__subtitle">Devicon · one icon per element</small>
    <input class="archinsight-picker__control" bind:value={filter} aria-label="Filter technology icons" aria-controls="technology-icon-options" aria-activedescendant={activeIndex < 0 ? undefined : `technology-icon-${choiceId(activeIndex)}`} placeholder="Filter icons" type="search" />
    <div id="technology-icon-options" class="archinsight-picker__options icon-options" role="listbox">
      {#if showNone}
        <button id="technology-icon-none" data-icon-index="0" class="archinsight-picker__option icon-option" type="button" role="option" aria-selected={activeIndex === 0} on:focus={() => activeIndex = 0} on:click={() => onSelect('none')}>
          <span class="icon-preview icon-none" aria-hidden="true">×</span>
          <span class="icon-label">None</span>
          <code class="archinsight-picker__muted">disable automatic icon</code>
        </button>
      {/if}
      {#each results as icon, index (icon.id)}
        <button id={`technology-icon-${icon.id}`} data-icon-index={index + (showNone ? 1 : 0)} class="archinsight-picker__option icon-option" type="button" role="option" aria-selected={index + (showNone ? 1 : 0) === activeIndex} on:focus={() => activeIndex = index + (showNone ? 1 : 0)} on:click={() => onSelect(icon.id)}>
          <span class="icon-preview" aria-hidden="true" use:observePreview={icon.id}>{@html previews[icon.id] ?? ''}</span>
          <span class="icon-label">{icon.label}</span>
          <code class="archinsight-picker__muted">{icon.id}</code>
        </button>
      {/each}
      {#if results.length === 0}<div class="archinsight-picker__message">No matching icons</div>{/if}
    </div>
    <div class="archinsight-picker__footer">
      <button class="archinsight-picker__button" type="button" on:click={onClose}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .icon-picker-backdrop {
    position: fixed;
    z-index: 100000;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 35%);
    color: var(--archinsight-foreground, #eeeeee);
  }
  .icon-picker { --archinsight-picker-width: min(380px, calc(100vw - 24px)); }
  .icon-options { max-height: min(420px, calc(100vh - 190px)); margin-top: 6px; }
  .icon-option { display: grid; grid-template-columns: 34px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 8px; }
  .icon-preview { grid-row: 1 / 3; align-self: center; width: 28px; height: 28px; color: currentColor; }
  .icon-preview :global(svg) { display: block; width: 28px; height: 28px; }
  .icon-none { display: grid; place-items: center; font-size: 24px; }
  .icon-label, .icon-option code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
