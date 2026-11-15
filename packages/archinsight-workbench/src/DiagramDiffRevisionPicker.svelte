<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { DiagramDiffPickerState } from './versioned-diagram-diff';
  import { diagramDiffCompareDisabledReason } from './versioned-diagram-diff';

  export let state: DiagramDiffPickerState = { status: 'closed' };
  export let onSelect: (side: 'before' | 'after', revision: string) => void = () => {};
  export let onCompare: () => void = () => {};
  export let onClose: () => void = () => {};

  let host: HTMLDivElement | undefined;
  $: disabledReason = diagramDiffCompareDisabledReason(state);

  onMount(() => {
    void tick().then(() => host?.querySelector<HTMLElement>('select, button')?.focus());
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
    const focusable = [...(host?.querySelectorAll<HTMLElement>('select, button:not(:disabled)') ?? [])];
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

<svelte:window on:pointerdown={closeOutside} on:keydown={keydown} />

<div bind:this={host} class="diff-picker" role="dialog" aria-label="Compare diagram revisions">
  <strong>Compare diagram revisions</strong>
  {#if state.status !== 'closed'}<small class="source">{state.source}</small>{/if}
  {#if state.status === 'loading'}
    <div class="message" role="status">Loading revision history…</div>
  {:else if state.status === 'error'}
    <div class="message error" role="alert">{state.message}</div>
  {:else if state.status === 'ready'}
    <label>
      <span>Before</span>
      <select aria-label="Before revision" value={state.before ?? ''} on:change={(event) => onSelect('before', event.currentTarget.value)}>
        <option disabled value="">No earlier revision</option>
        {#each state.catalogue.revisions as revision (revision.id)}
          <option value={revision.id}>{revision.shortId} — {revision.summary}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>After</span>
      <select aria-label="After revision" value={state.after} on:change={(event) => onSelect('after', event.currentTarget.value)}>
        {#each state.catalogue.revisions as revision (revision.id)}
          <option value={revision.id}>{revision.shortId} — {revision.summary}</option>
        {/each}
      </select>
    </label>
    <div class="revision-list" aria-label="Available revisions">
      {#each state.catalogue.revisions as revision (revision.id)}
        <div class="revision-row">
          <code>{revision.shortId}</code>
          <span>{revision.summary || 'No commit message'}</span>
          <small>{revision.actorName} · {new Date(revision.createdAt).toLocaleString()}</small>
        </div>
      {/each}
    </div>
    {#if disabledReason !== undefined}<div class="reason">{disabledReason}</div>{/if}
  {/if}
  <div class="actions">
    <button type="button" on:click={onClose}>Cancel</button>
    <button
      class="primary"
      type="button"
      disabled={disabledReason !== undefined}
      title={disabledReason}
      on:click={onCompare}
    >Compare</button>
  </div>
</div>

<style>
  .diff-picker {
    width: 360px;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid var(--archinsight-border, #454545);
    border-radius: 6px;
    background: var(--archinsight-toolbar-bg, #242424);
    color: var(--archinsight-foreground, #eeeeee);
    box-shadow: var(--archinsight-shadow, 0 10px 28px rgb(0 0 0 / 35%));
  }
  strong, .source { display: block; }
  .source { margin: 3px 0 8px; color: var(--archinsight-muted, #a8a8a8); overflow-wrap: anywhere; }
  label { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 6px; margin: 6px 0; font-size: 11px; }
  select { min-width: 0; height: 30px; border: 1px solid var(--archinsight-border, #454545); border-radius: 4px; background: var(--archinsight-input-bg, #1f1f1f); color: inherit; }
  .revision-list { max-height: 190px; margin-top: 8px; overflow-y: auto; }
  .revision-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 7px; padding: 6px; border-radius: 4px; background: var(--archinsight-control-bg, #2a2a2a); font-size: 11px; }
  .revision-row + .revision-row { margin-top: 3px; }
  .revision-row small { grid-column: 2; color: var(--archinsight-muted, #a8a8a8); }
  .message, .reason { padding: 12px 4px; color: var(--archinsight-muted, #a8a8a8); font-size: 12px; }
  .error { color: var(--archinsight-error, #f48771); }
  .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
  button { min-width: 72px; height: 28px; border: 0; border-radius: 4px; background: var(--archinsight-control-bg, #2a2a2a); color: inherit; }
  button:hover:not(:disabled), button:focus-visible { background: var(--archinsight-control-hover-bg, #343434); }
  button.primary { background: var(--color-primary, #397a3f); }
  button:disabled { opacity: .45; }
</style>
