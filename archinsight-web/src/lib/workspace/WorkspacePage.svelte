<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import 'monaco-editor';
  import type { WorkspaceSurface } from '$lib/actions/action-model';
  import WorkspaceShell from '$lib/workspace/shell/WorkspaceShell.svelte';
  import { createWorkspaceRuntime } from '$lib/workspace/shell/workspace-runtime';
  import {
    createWorkspaceShellView
  } from '$lib/workspace/shell/workspace-shell-model';
  import {
    initialWorkspaceRuntimeState
  } from '$lib/workspace/shell/workspace-runtime-state';

  export let surface: WorkspaceSurface = 'editor';

  let state = initialWorkspaceRuntimeState();
  let editorHost: HTMLDivElement;

  const runtime = createWorkspaceRuntime({
    surface: () => surface,
    state: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    editorHost: () => editorHost
  });

  $: shellView = createWorkspaceShellView(surface, state, runtime);

  onMount(() => runtime.start());
  onDestroy(runtime.dispose);
</script>

<WorkspaceShell
  view={shellView}
  controllers={runtime.controllers}
  bind:editorHost
  onOpenRepositoryMenu={runtime.openRepositoryMenu}
  onCloseRepositoryMenu={runtime.closeRepositoryMenu}
/>
