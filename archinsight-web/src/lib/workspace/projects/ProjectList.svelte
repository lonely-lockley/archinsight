<script lang="ts">
  import type { ProjectSummary } from '$lib/storage';
  import { formatProjectDate } from './project-dialog-model';
  import type { ProjectDialogIntent } from './project-dialog-types';

  export let projects: readonly ProjectSummary[];
  export let activeProjectId: string | undefined = undefined;
  export let publishedProjectId: string | undefined = undefined;
  export let busy: boolean;
  export let error: string | undefined = undefined;
  export let onIntent: (intent: ProjectDialogIntent) => void;

  $: dateLocales = typeof navigator === 'undefined' ? undefined : navigator.languages;
</script>

<header class="project-dialog-header">
  <h2>Manage Projects</h2>
  <button type="button" on:click={() => onIntent({ type: 'new' })}>New Project</button>
</header>
<div class="project-list">
  {#each projects as project (project.id)}
    <div class:active={project.id === activeProjectId} class="project-row">
      <button class="project-select" type="button" disabled={busy} on:click={() => onIntent({ type: 'select', projectId: project.id })}>
        <span class="project-title">
          <span class="project-name">{project.name}</span>
          {#if project.id === activeProjectId}<span class="active-project-label">Active</span>{/if}
          {#if project.id === publishedProjectId}<span class="playground-project-label">Playground</span>{/if}
        </span>
        <span class="project-stat"><strong>Created</strong>{formatProjectDate(project.created, dateLocales)}</span>
        <span class="project-stat"><strong>Last modified</strong>{formatProjectDate(project.updated, dateLocales)}</span>
        <span class="project-stat"><strong>Files</strong>{project.fileCount ?? 0}</span>
      </button>
      <div class="project-row-actions">
        <button aria-label={`Edit ${project.name}`} title="Edit project" type="button" disabled={busy} on:click={() => onIntent({ type: 'edit', projectId: project.id })}>
          <span aria-hidden="true" class="codicon codicon-edit"></span>
        </button>
        <button aria-label={`Delete ${project.name}`} title="Delete project" type="button" disabled={busy} on:click={() => onIntent({ type: 'delete', projectId: project.id })}>
          <span aria-hidden="true" class="codicon codicon-trash"></span>
        </button>
      </div>
    </div>
  {/each}
  {#if error !== undefined}<div class="dialog-error">{error}</div>{/if}
</div>
<footer>
  <button type="button" on:click={() => onIntent({ type: 'close' })}>Close</button>
</footer>

<style>
  header {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-bottom: 1px solid #3a3a3a;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .project-dialog-header {
    justify-content: space-between;
    gap: 16px;
  }

  .project-dialog-header button,
  footer button {
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid #505050;
    border-radius: 4px;
    background: #333333;
    color: #eeeeee;
  }

  .project-list {
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 0;
    padding: 12px 16px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .project-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 68px;
    border: 1px solid #414141;
    border-radius: 5px;
    background: #202020;
    color: #dddddd;
    overflow: hidden;
  }

  .project-row:hover,
  .project-row:focus-within {
    border-color: #648744;
    background: #293025;
  }

  .project-row.active {
    border-color: var(--color-primary);
  }

  .project-select {
    display: grid;
    grid-template-columns: minmax(160px, 1.5fr) minmax(130px, 1fr) minmax(130px, 1fr) 70px;
    gap: 14px;
    align-items: center;
    align-self: stretch;
    min-width: 0;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .project-row-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
  }

  .project-row-actions button {
    display: grid;
    width: 30px;
    height: 30px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #c8c8c8;
  }

  .project-row-actions button:hover {
    background: #3b3b3b;
    color: #ffffff;
  }

  .project-name {
    overflow: hidden;
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-title {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }

  .project-stat {
    display: grid;
    gap: 4px;
    color: #bdbdbd;
    font-size: 12px;
  }

  .project-stat strong {
    color: #858585;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .active-project-label {
    flex: none;
    padding: 2px 5px;
    border: 1px solid color-mix(in srgb, var(--color-primary) 65%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .playground-project-label {
    flex: none;
    padding: 2px 5px;
    border: 1px solid #557b9d;
    border-radius: 3px;
    background: #263847;
    color: #9dccf3;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .dialog-error {
    color: #ff8787;
    font-size: 12px;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #3a3a3a;
  }

  footer button {
    min-width: 76px;
    height: 30px;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #2b2b2b;
    color: #eeeeee;
    font: inherit;
    font-size: 12px;
  }

  footer button:hover,
  footer button:focus-visible {
    border-color: #5a5a5a;
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  @media (max-width: 680px) {
    .project-row {
      grid-template-columns: 1fr;
    }

    .project-select {
      grid-template-columns: 1fr 1fr;
    }

    .project-row-actions {
      justify-content: flex-end;
      padding: 0 10px 10px;
    }

    .project-title {
      grid-column: 1 / -1;
    }
  }
</style>
