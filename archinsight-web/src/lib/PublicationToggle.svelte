<script lang="ts">
  import type { ControlState } from './actions/action-model';

  export let state: ControlState;
  export let checked = false;
  export let busy = false;
  export let onToggle: (checked: boolean) => void;
</script>

{#if !state.hidden}
  <label class:disabled={state.disabled || busy} class="publication-toggle" title={state.reason ?? 'Publish project in playground'}>
    <input
      type="checkbox"
      {checked}
      disabled={state.disabled || busy}
      on:change={(event) => onToggle((event.currentTarget as HTMLInputElement).checked)}
    />
    <span>Playground</span>
  </label>
{/if}

<style>
  .publication-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    background: #242424;
    color: #eeeeee;
    font-size: 12px;
    user-select: none;
  }

  .publication-toggle.disabled {
    color: #777777;
    cursor: not-allowed;
  }
</style>
