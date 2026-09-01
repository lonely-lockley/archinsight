import { describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '$lib/storage';
import type { ProjectController } from './project-controller';
import { createProjectDialogController, type ProjectDialogControllerPorts } from './project-dialog-controller';
import type { ProjectDialogState } from './project-dialog-types';

const projects: ProjectSummary[] = [{ id: 'one', name: 'Project One' }];

function fixture(initial?: ProjectDialogState) {
  let dialog = initial;
  const commands: ProjectController = {
    create: vi.fn(async () => ({ ok: true as const, project: projects[0]!, publishedProjectId: undefined })),
    update: vi.fn(async () => ({ ok: true as const, project: projects[0]!, publishedProjectId: undefined })),
    delete: vi.fn(async () => ({ ok: true as const, publishedProjectId: undefined }))
  };
  const ports: ProjectDialogControllerPorts = {
    dialog: () => dialog,
    setDialog: (next) => { dialog = next; },
    projects: () => projects,
    publishedProjectId: () => undefined,
    publicationAllowed: () => true,
    commands,
    switchProject: vi.fn(async () => undefined),
    acceptDeletedProject: vi.fn(async () => 1),
    redirectIfAuthRequired: vi.fn(() => false)
  };
  return { ports, commands, controller: createProjectDialogController(ports), dialog: () => dialog };
}

describe('project dialog controller', () => {
  it('opens the list for existing projects and create mode for an empty registry', () => {
    const subject = fixture();
    subject.controller.open();
    expect(subject.dialog()?.mode).toBe('list');

    const empty = fixture();
    empty.ports.projects = () => [];
    empty.controller.open();
    expect(empty.dialog()?.mode).toBe('create');
  });

  it('does not close a busy dialog', () => {
    const subject = fixture({ mode: 'create', name: 'name', published: false, busy: true });
    subject.controller.close();
    expect(subject.dialog()).toBeDefined();
  });

  it('opens edit and delete confirmations only for known projects', () => {
    const subject = fixture({ mode: 'list', name: '', published: false, busy: false });
    subject.controller.handle({ type: 'edit', projectId: 'one' });
    expect(subject.dialog()).toMatchObject({ mode: 'edit', name: 'Project One', targetId: 'one' });
    subject.controller.handle({ type: 'back' });
    subject.controller.handle({ type: 'delete', projectId: 'one' });
    expect(subject.dialog()).toMatchObject({ mode: 'delete', targetId: 'one' });
  });

  it('validates a blank project name before calling commands', () => {
    const subject = fixture({ mode: 'create', name: '   ', published: false, busy: false });
    subject.controller.handle({ type: 'submit-create' });
    expect(subject.dialog()?.error).toBe('Project name is required');
    expect(subject.commands.create).not.toHaveBeenCalled();
  });

  it('creates, selects, and closes after a successful command', async () => {
    const subject = fixture({ mode: 'create', name: ' Project One ', published: false, busy: false });
    subject.controller.handle({ type: 'submit-create' });

    await vi.waitFor(() => expect(subject.ports.switchProject).toHaveBeenCalledWith('one'));
    expect(subject.commands.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Project One' }));
    expect(subject.dialog()).toBeUndefined();
  });

  it('keeps a created project editable when publication fails', async () => {
    const subject = fixture({ mode: 'create', name: 'Project One', published: true, busy: false });
    vi.mocked(subject.commands.create).mockResolvedValueOnce({
      ok: false,
      stage: 'publication',
      project: projects[0]!,
      publishedProjectId: undefined,
      cause: new Error('publish failed')
    });
    subject.controller.handle({ type: 'submit-create' });

    await vi.waitFor(() => expect(subject.dialog()?.busy).toBe(false));
    expect(subject.dialog()).toMatchObject({
      mode: 'edit', targetId: 'one', error: expect.stringContaining('publish failed')
    });
  });

  it('updates a project and returns to the list', async () => {
    const subject = fixture({
      mode: 'edit', name: 'Renamed', targetId: 'one', published: false, busy: false
    });
    subject.controller.handle({ type: 'submit-edit' });

    await vi.waitFor(() => expect(subject.dialog()?.mode).toBe('list'));
    expect(subject.commands.update).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'one', name: 'Renamed'
    }));
  });

  it('returns to create mode after deleting the last project', async () => {
    const subject = fixture({ mode: 'delete', name: 'Project One', targetId: 'one', published: false, busy: false });
    vi.mocked(subject.ports.acceptDeletedProject).mockResolvedValueOnce(0);
    subject.controller.handle({ type: 'submit-delete' });

    await vi.waitFor(() => expect(subject.dialog()?.mode).toBe('create'));
    expect(subject.commands.delete).toHaveBeenCalledWith({ projectId: 'one', publishedProjectId: undefined });
  });
});
