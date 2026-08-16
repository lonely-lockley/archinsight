<script lang="ts">
  export let host: HTMLDivElement;
  export let active = false;
</script>

<div class:no-active-tab={!active} class="monaco-host" bind:this={host}></div>

<style>
  .monaco-host {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .monaco-host.no-active-tab {
    visibility: hidden;
  }
</style>
