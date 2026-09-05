// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ControlState } from '$lib/actions/action-model';
import type { ProjectSummary } from '$lib/storage';
import ProjectDialog from './ProjectDialog.svelte';
import type { ProjectDialogState, ProjectDialogViewModel } from './project-dialog-types';

const enabled: ControlState = { hidden: false, disabled: false };
const projects: ProjectSummary[] = [
  {
    id: 'project-1',
    name: 'Payments',
    created: 'not-a-date',
    updated: undefined,
    fileCount: 3
  },
  {
    id: 'project-2',
    name: 'Orders',
    created: undefined,
    updated: undefined
  }
];

function view(dialog: ProjectDialogState, overrides: Partial<ProjectDialogViewModel> = {}): ProjectDialogViewModel {
  return {
    dialog,
    projects,
    activeProjectId: 'project-1',
    publishedProjectId: 'project-2',
    publicationState: enabled,
    ...overrides
  };
}

describe('ProjectDialog', () => {
  it('renders project status and emits list intents without closing on inner clicks', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onIntent = vi.fn();
    const component = mount(ProjectDialog, {
      target,
      props: {
        view: view({ mode: 'list', name: '', published: false, busy: false, error: 'List failed' }),
        onIntent
      }
    });

    expect(target.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Manage Projects');
    expect(target.querySelector('.project-row.active .project-name')?.textContent).toBe('Payments');
    expect(target.querySelector('.active-project-label')?.textContent).toBe('Active');
    expect(target.querySelector('.playground-project-label')?.parentElement?.textContent).toContain('Orders');
    expect([...target.querySelectorAll('.project-stat')].map((item) => item.textContent)).toEqual([
      'Creatednot-a-date', 'Last modified—', 'Files3',
      'Created—', 'Last modified—', 'Files0'
    ]);
    expect(target.querySelector('.dialog-error')?.textContent).toBe('List failed');

    target.querySelector<HTMLElement>('.project-dialog')?.click();
    expect(onIntent).not.toHaveBeenCalled();
    [...target.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'New Project')?.click();
    target.querySelector<HTMLButtonElement>('.project-select')?.click();
    target.querySelector<HTMLButtonElement>('[aria-label="Edit Payments"]')?.click();
    target.querySelector<HTMLButtonElement>('[aria-label="Delete Payments"]')?.click();
    [...target.querySelectorAll<HTMLButtonElement>('footer button')].find((button) => button.textContent === 'Close')?.click();
    target.querySelector<HTMLElement>('.modal-backdrop')?.click();

    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: 'new' },
      { type: 'select', projectId: 'project-1' },
      { type: 'edit', projectId: 'project-1' },
      { type: 'delete', projectId: 'project-1' },
      { type: 'close' },
      { type: 'close' }
    ]);

    await unmount(component);
    target.remove();
  });

  it('renders create state and emits controlled form changes, back, and submit', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onIntent = vi.fn();
    const component = mount(ProjectDialog, {
      target,
      props: {
        view: view({
          mode: 'create',
          name: 'Architecture',
          published: true,
          busy: false,
          error: 'Name already exists'
        }),
        onIntent
      }
    });

    expect(target.querySelector('h2')?.textContent).toBe('Create Project');
    expect(target.querySelector('.dialog-error')?.textContent).toBe('Name already exists');
    const name = target.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
    const publication = target.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(name?.value).toBe('Architecture');
    expect(publication?.checked).toBe(true);
    name!.value = 'Platform';
    name!.dispatchEvent(new Event('input', { bubbles: true }));
    publication!.checked = false;
    publication!.dispatchEvent(new Event('change', { bubbles: true }));
    [...target.querySelectorAll<HTMLButtonElement>('footer button')].find((button) => button.textContent === 'Back')?.click();
    target.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: 'name-change', name: 'Platform' },
      { type: 'publication-change', published: false },
      { type: 'back' },
      { type: 'submit-create' }
    ]);

    await unmount(component);
    target.remove();
  });

  it('hides unavailable publication control and disables a busy create form', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onIntent = vi.fn();
    const component = mount(ProjectDialog, {
      target,
      props: {
        view: view(
          { mode: 'create', name: '', published: false, busy: true },
          {
            projects: [],
            publicationState: { hidden: true, disabled: true, reason: 'Not permitted' }
          }
        ),
        onIntent
      }
    });

    expect(target.querySelector('input[type="checkbox"]')).toBeNull();
    expect(target.querySelector('button[type="submit"]')?.textContent).toBe('Creating…');
    expect([...target.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled)).toBe(true);
    expect([...target.querySelectorAll<HTMLButtonElement>('footer button')].map((button) => [button.textContent, button.disabled]))
      .toEqual([['Cancel', true], ['Creating…', true]]);

    await unmount(component);
    target.remove();
  });

  it('renders edit and delete modes with their distinct intents and busy labels', async () => {
    const editTarget = document.createElement('div');
    document.body.append(editTarget);
    const editIntent = vi.fn();
    const editComponent = mount(ProjectDialog, {
      target: editTarget,
      props: {
        view: view({ mode: 'edit', name: 'Payments', published: true, busy: false, targetId: 'project-1' }),
        onIntent: editIntent
      }
    });

    expect(editTarget.querySelector('h2')?.textContent).toBe('Edit Project');
    editTarget.querySelector<HTMLInputElement>('input:not([type])')!.value = 'Billing';
    editTarget.querySelector<HTMLInputElement>('input:not([type])')!.dispatchEvent(new Event('input', { bubbles: true }));
    [...editTarget.querySelectorAll<HTMLButtonElement>('footer button')].find((button) => button.textContent === 'Back')?.click();
    editTarget.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(editIntent.mock.calls.map(([intent]) => intent)).toEqual([
      { type: 'name-change', name: 'Billing' },
      { type: 'back' },
      { type: 'submit-edit' }
    ]);

    const deleteTarget = document.createElement('div');
    document.body.append(deleteTarget);
    const deleteIntent = vi.fn();
    const deleteComponent = mount(ProjectDialog, {
      target: deleteTarget,
      props: {
        view: view({ mode: 'delete', name: 'Payments', published: false, busy: true, targetId: 'project-1', error: 'Delete failed' }),
        onIntent: deleteIntent
      }
    });

    expect(deleteTarget.querySelector('h2')?.textContent).toBe('Delete Project');
    expect(deleteTarget.querySelector('p')?.textContent).toContain('Payments');
    expect(deleteTarget.querySelector('.dialog-error')?.textContent).toBe('Delete failed');
    expect(deleteTarget.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Deleting…');
    expect([...deleteTarget.querySelectorAll<HTMLButtonElement>('footer button')].every((button) => button.disabled)).toBe(true);

    await unmount(editComponent);
    await unmount(deleteComponent);
    editTarget.remove();
    deleteTarget.remove();
  });
});
