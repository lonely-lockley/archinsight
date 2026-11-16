<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { DiagramDiffPickerState } from './versioned-diagram-diff';
  import { orderedDiagramDiffRevisionPair, updateDiagramDiffRevisionSelection } from './versioned-diagram-diff';
  import './overlay-picker.css';

  export let state: DiagramDiffPickerState = { status: 'closed' };
  export let onSelect: (side: 'before' | 'after', revision: string) => void = () => {};
  export let onCompare: () => void = () => {};
  export let onClose: () => void = () => {};

  let host: HTMLDivElement | undefined;
  let filter = '';
  let selectedRevisions: readonly string[] = [];
  let revisionSet = '';
  $: readyState = state.status === 'ready' ? state : undefined;
  $: selectedPair = readyState !== undefined && selectedRevisions.length === 2
    ? orderedDiagramDiffRevisionPair(readyState, selectedRevisions[0]!, selectedRevisions[1]!)
    : undefined;
  $: compareDisabled = readyState === undefined || selectedPair === undefined || readyState.validationError !== undefined;
  $: filterValue = filter.trim().toLocaleLowerCase();
  $: filteredRevisions = readyState?.catalogue.revisions.filter((revision) => filterValue.length === 0
    || revision.shortId.toLocaleLowerCase().includes(filterValue)
    || revision.summary.toLocaleLowerCase().includes(filterValue)
    || revision.actorName.toLocaleLowerCase().includes(filterValue)) ?? [];
  $: {
    const nextRevisionSet = readyState?.catalogue.revisions.map((revision) => revision.id).join('\0') ?? '';
    if (nextRevisionSet !== revisionSet) {
      filter = '';
      selectedRevisions = readyState === undefined
        ? []
        : [readyState.after, ...(readyState.before === undefined ? [] : [readyState.before])];
    }
    revisionSet = nextRevisionSet;
  }

  onMount(() => {
    void tick().then(() => host?.querySelector<HTMLElement>('input, button')?.focus());
  });

  function closeOutside(event: PointerEvent): void {
    if (host !== undefined && event.target instanceof Node && !host.contains(event.target)) onClose();
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(host?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [])];
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

  function selectRevision(revision: string): void {
    if (readyState === undefined) return;
    selectedRevisions = updateDiagramDiffRevisionSelection(readyState, selectedRevisions, revision);
    if (selectedRevisions.length !== 2) return;
    const pair = orderedDiagramDiffRevisionPair(readyState, selectedRevisions[0]!, selectedRevisions[1]!);
    if (pair !== undefined) {
      onSelect('before', pair.before);
      onSelect('after', pair.after);
    }
  }

  function revisionRangePosition(
    revision: string,
    pair: { readonly before: string; readonly after: string } | undefined,
  ): 'after' | 'between' | 'before' | undefined {
    if (readyState === undefined || pair === undefined) return undefined;
    const revisionIndex = readyState.catalogue.revisions.findIndex((item) => item.id === revision);
    const afterIndex = readyState.catalogue.revisions.findIndex((item) => item.id === pair.after);
    const beforeIndex = readyState.catalogue.revisions.findIndex((item) => item.id === pair.before);
    if (revisionIndex < afterIndex || revisionIndex > beforeIndex || afterIndex >= beforeIndex) return undefined;
    if (revisionIndex === afterIndex) return 'after';
    if (revisionIndex === beforeIndex) return 'before';
    return 'between';
  }

  function revisionSelected(revision: string, selection: readonly string[]): boolean {
    return selection.includes(revision);
  }
</script>

<svelte:window on:pointerdown={closeOutside} on:keydown={keydown} />

<div bind:this={host} class="archinsight-picker diff-picker" role="dialog" aria-label="Compare diagram revisions">
  <strong class="archinsight-picker__title">Compare diagram revisions</strong>
  {#if state.status !== 'closed'}<small class="archinsight-picker__subtitle source">{state.source}</small>{/if}
  {#if state.status === 'loading'}
    <div class="archinsight-picker__message message" role="status">Loading revision history…</div>
  {:else if state.status === 'error'}
    <div class="archinsight-picker__message message error" role="alert">{state.message}</div>
  {:else if state.status === 'ready'}
    {#if state.catalogue.revisions.length > 1}
      <input class="archinsight-picker__control revision-filter" bind:value={filter} aria-label="Filter commits" placeholder="Filter commits" type="search" />
    {/if}
    <div class="archinsight-picker__options revision-list" aria-label="Available revisions" aria-multiselectable="true" role="listbox">
      {#each filteredRevisions as revision (revision.id)}
        {@const rangePosition = revisionRangePosition(revision.id, selectedPair)}
        {@const selected = revisionSelected(revision.id, selectedRevisions)}
        <button
          aria-label={`${revision.shortId}: ${revision.summary || 'No commit message'}, ${revision.actorName}`}
          aria-selected={selected}
          class="archinsight-picker__option revision-row"
          class:archinsight-picker__option--selected={selected}
          class:revision-row--in-range={rangePosition !== undefined}
          class:revision-row--range-after={rangePosition === 'after'}
          class:revision-row--range-before={rangePosition === 'before'}
          data-range-position={rangePosition}
          data-revision-id={revision.id}
          role="option"
          type="button"
          on:click={() => selectRevision(revision.id)}
        >
          <code class="revision-id">{revision.shortId}</code>
          <span class="revision-summary">{revision.summary || 'No commit message'}</span>
          {#if selectedPair?.after === revision.id}
            <small class="revision-edge">After</small>
          {:else if selectedPair?.before === revision.id}
            <small class="revision-edge">Before</small>
          {/if}
          <small class="archinsight-picker__muted revision-meta">{revision.actorName} · {new Date(revision.createdAt).toLocaleString()}</small>
        </button>
      {/each}
      {#if filteredRevisions.length === 0}
        <div class="archinsight-picker__message">No matching commits</div>
      {/if}
    </div>
  {/if}
  <div class="archinsight-picker__footer actions">
    <button class="archinsight-picker__button" type="button" on:click={onClose}>Cancel</button>
    <button
      class="archinsight-picker__button archinsight-picker__button--primary primary"
      type="button"
      disabled={compareDisabled}
      on:click={onCompare}
    >Compare</button>
  </div>
</div>

<style>
  .diff-picker {
    --archinsight-picker-width: 360px;
  }
  .revision-filter { margin-bottom: 6px; }
  .revision-list { max-height: 230px; }
  .revision-row { position: relative; display: grid; grid-template-columns: 8ch minmax(0, 1fr) auto; gap: 2px 7px; }
  .revision-id { white-space: nowrap; }
  .revision-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .revision-meta { grid-column: 2 / 4; }
  .revision-edge { align-self: center; color: var(--color-primary, #6a9955); font-size: 9px; font-weight: 600; text-transform: uppercase; }
  .revision-row--in-range::before {
    position: absolute;
    top: -3px;
    bottom: -3px;
    left: 2px;
    width: 2px;
    background: var(--color-primary, #6a9955);
    content: '';
  }
  .revision-row--range-after::before { top: 50%; border-radius: 2px 2px 0 0; }
  .revision-row--range-before::before { bottom: 50%; border-radius: 0 0 2px 2px; }
  .error { color: var(--archinsight-error, #f48771); }
</style>
