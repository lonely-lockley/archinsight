<script lang="ts">
  import ProjectList from './ProjectList.svelte';
  import type { ProjectDialogIntent, ProjectDialogViewModel } from './project-dialog-types';

  export let view: ProjectDialogViewModel;
  export let onIntent: (intent: ProjectDialogIntent) => void;

  $: dialog = view.dialog;
  function changeName(event: Event): void {
    onIntent({
      type: 'name-change',
      name: (event.currentTarget as HTMLInputElement).value
    });
  }

  function changePublication(event: Event): void {
    onIntent({
      type: 'publication-change',
      published: (event.currentTarget as HTMLInputElement).checked
    });
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={() => onIntent({ type: 'close' })}>
  <div
    class="file-dialog project-dialog"
    class:project-list-dialog={dialog.mode === 'list'}
    role="dialog"
    aria-modal="true"
    aria-label="Manage Projects"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(event) => event.stopPropagation()}
  >
    {#if dialog.mode === 'list'}
      <ProjectList
        projects={view.projects}
        activeProjectId={view.activeProjectId}
        publishedProjectId={view.publishedProjectId}
        busy={dialog.busy}
        error={dialog.error}
        {onIntent}
      />
    {:else if dialog.mode === 'create'}
      <form on:submit|preventDefault={() => onIntent({ type: 'submit-create' })}>
        <header><h2>Create Project</h2></header>
        <div class="file-dialog-body">
          <label class="file-name-field">
            <span>Name</span>
            <input
              autocomplete="off"
              maxlength="100"
              spellcheck="false"
              disabled={dialog.busy}
              value={dialog.name}
              on:input={changeName}
            />
          </label>
          {#if !view.publicationState.hidden}
            <label class="project-publication-field">
              <input type="checkbox" disabled={dialog.busy} checked={dialog.published} on:change={changePublication} />
              <span>Available in Playground</span>
            </label>
          {/if}
          {#if dialog.error !== undefined}<div class="dialog-error">{dialog.error}</div>{/if}
        </div>
        <footer>
          {#if view.projects.length > 0}
            <button type="button" disabled={dialog.busy} on:click={() => onIntent({ type: 'back' })}>Back</button>
          {:else}
            <button type="button" disabled={dialog.busy} on:click={() => onIntent({ type: 'close' })}>Cancel</button>
          {/if}
          <button type="submit" disabled={dialog.busy}>{dialog.busy ? 'Creating…' : 'Create'}</button>
        </footer>
      </form>
    {:else if dialog.mode === 'edit'}
      <form on:submit|preventDefault={() => onIntent({ type: 'submit-edit' })}>
        <header><h2>Edit Project</h2></header>
        <div class="file-dialog-body">
          <label class="file-name-field">
            <span>Name</span>
            <input autocomplete="off" maxlength="100" spellcheck="false" disabled={dialog.busy} value={dialog.name} on:input={changeName} />
          </label>
          {#if !view.publicationState.hidden}
            <label class="project-publication-field">
              <input type="checkbox" disabled={dialog.busy} checked={dialog.published} on:change={changePublication} />
              <span>Available in Playground</span>
            </label>
          {/if}
          {#if dialog.error !== undefined}<div class="dialog-error">{dialog.error}</div>{/if}
        </div>
        <footer>
          <button type="button" disabled={dialog.busy} on:click={() => onIntent({ type: 'back' })}>Back</button>
          <button type="submit" disabled={dialog.busy}>{dialog.busy ? 'Saving…' : 'Save'}</button>
        </footer>
      </form>
    {:else}
      <form on:submit|preventDefault={() => onIntent({ type: 'submit-delete' })}>
        <header><h2>Delete Project</h2></header>
        <div class="file-dialog-body confirm-dialog-body">
          <p>Delete “{dialog.name}” and all files inside it? This action cannot be undone.</p>
          {#if dialog.error !== undefined}<div class="dialog-error">{dialog.error}</div>{/if}
        </div>
        <footer>
          <button type="button" disabled={dialog.busy} on:click={() => onIntent({ type: 'back' })}>Cancel</button>
          <button class="danger-button" type="submit" disabled={dialog.busy}>{dialog.busy ? 'Deleting…' : 'Delete'}</button>
        </footer>
      </form>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 38%);
    -webkit-backdrop-filter: blur(5px);
    backdrop-filter: blur(5px);
  }

  .file-dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: min(620px, calc(100vh - 32px));
    border: 1px solid #474747;
    border-radius: 6px;
    background: #252525;
    color: #eeeeee;
    box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
  }

  .file-dialog form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: inherit;
  }

  .project-dialog {
    width: min(820px, calc(100vw - 32px));
  }

  .project-dialog.project-list-dialog {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: min(520px, calc(100vh - 32px));
    overflow: hidden;
  }

  .file-dialog footer button {
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid #505050;
    border-radius: 4px;
    background: #333333;
    color: #eeeeee;
  }

  .danger-button {
    border-color: #8c4848 !important;
    background: #6d3333 !important;
  }

  .file-dialog header {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-bottom: 1px solid #3a3a3a;
  }

  .file-dialog h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .file-dialog-body {
    display: grid;
    gap: 12px;
    min-height: 0;
    padding: 12px 16px;
  }

  .confirm-dialog-body p {
    margin: 0;
    color: #d8d8d8;
    font-size: 13px;
    line-height: 1.4;
  }

  .file-name-field {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: #cfcfcf;
  }

  .project-publication-field {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    color: #cfcfcf;
    font-size: 12px;
  }

  .file-name-field input {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #1f1f1f;
    color: #ffffff;
    font: inherit;
    padding: 0 9px;
  }

  .file-name-field input:focus {
    border-color: var(--color-primary);
    outline: none;
  }

  .dialog-error {
    color: #ff8787;
    font-size: 12px;
  }

  .file-dialog footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #3a3a3a;
  }

  .file-dialog footer button {
    min-width: 76px;
    height: 30px;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #2b2b2b;
    color: #eeeeee;
    font: inherit;
    font-size: 12px;
  }

  .file-dialog footer button:hover,
  .file-dialog footer button:focus-visible {
    border-color: #5a5a5a;
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  .file-dialog footer button[type="submit"] {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: #121212;
  }

  .file-dialog footer button[type="submit"]:hover,
  .file-dialog footer button[type="submit"]:focus-visible {
    border-color: #4be08a;
    background: #4be08a;
    color: #101010;
  }

</style>
