import type { ProjectSummary } from '$lib/storage';
import { errorMessage } from '../messages/message-controller';
import type { ProjectController } from './project-controller';
import type { ProjectDialogIntent, ProjectDialogState } from './project-dialog-types';

export type ProjectDialogControllerPorts = {
  dialog(): ProjectDialogState | undefined;
  setDialog(dialog: ProjectDialogState | undefined): void;
  projects(): readonly ProjectSummary[];
  publishedProjectId(): string | undefined;
  publicationAllowed(): boolean;
  commands: ProjectController;
  switchProject(projectId: string): Promise<void>;
  acceptDeletedProject(projectId: string): Promise<number>;
  redirectIfAuthRequired(error: unknown): boolean;
};

export type ProjectDialogController = {
  open(create?: boolean): void;
  close(): void;
  handle(intent: ProjectDialogIntent): void;
};

export function createProjectDialogController(ports: ProjectDialogControllerPorts): ProjectDialogController {
  const close = (): void => {
    if (ports.dialog()?.busy) {
      return;
    }
    ports.setDialog(undefined);
  };

  const edit = (projectId: string): void => {
    const project = ports.projects().find((item) => item.id === projectId);
    if (ports.dialog() === undefined || project === undefined) {
      return;
    }
    ports.setDialog({
      mode: 'edit',
      name: project.name,
      published: ports.publishedProjectId() === project.id,
      targetId: project.id,
      busy: false
    });
  };

  const askDelete = (projectId: string): void => {
    const project = ports.projects().find((item) => item.id === projectId);
    if (ports.dialog() === undefined || project === undefined) {
      return;
    }
    ports.setDialog({
      mode: 'delete',
      name: project.name,
      published: false,
      targetId: project.id,
      busy: false
    });
  };

  const confirmCreate = async (): Promise<void> => {
    const dialog = ports.dialog();
    if (dialog === undefined || dialog.busy) {
      return;
    }
    const name = dialog.name.trim();
    if (name.length === 0) {
      ports.setDialog({ ...dialog, error: 'Project name is required' });
      return;
    }
    const publicationAllowed = ports.publicationAllowed();
    const published = publicationAllowed && dialog.published;
    ports.setDialog({ ...dialog, busy: true, error: undefined });
    let createdProjectId: string | undefined;
    try {
      const result = await ports.commands.create({
        name,
        publicationAllowed,
        published,
        publishedProjectId: ports.publishedProjectId()
      });
      if (!result.ok) {
        if (result.stage === 'publication') {
          createdProjectId = result.project.id;
        }
        if (!ports.redirectIfAuthRequired(result.cause) && ports.dialog() !== undefined) {
          ports.setDialog(result.stage === 'create'
            ? { ...ports.dialog()!, busy: false, error: errorMessage(result.cause) }
            : {
                mode: 'edit',
                name,
                published,
                targetId: result.project.id,
                busy: false,
                error: `Project was created, but its Playground setting could not be saved: ${errorMessage(result.cause)}`
              });
        }
        return;
      }
      createdProjectId = result.project.id;
      await ports.switchProject(result.project.id);
      ports.setDialog(undefined);
    } catch (error) {
      if (!ports.redirectIfAuthRequired(error) && ports.dialog() !== undefined) {
        ports.setDialog(createdProjectId === undefined
          ? { ...ports.dialog()!, busy: false, error: errorMessage(error) }
          : {
              mode: 'edit',
              name,
              published,
              targetId: createdProjectId,
              busy: false,
              error: `Project was created, but its Playground setting could not be saved: ${errorMessage(error)}`
            });
      }
    }
  };

  const confirmEdit = async (): Promise<void> => {
    const dialog = ports.dialog();
    if (dialog === undefined || dialog.busy || dialog.targetId === undefined) {
      return;
    }
    const name = dialog.name.trim();
    if (name.length === 0) {
      ports.setDialog({ ...dialog, error: 'Project name is required' });
      return;
    }
    const publicationAllowed = ports.publicationAllowed();
    ports.setDialog({ ...dialog, busy: true, error: undefined });
    try {
      const result = await ports.commands.update({
        projectId: dialog.targetId,
        name,
        publicationAllowed,
        published: publicationAllowed && dialog.published,
        publishedProjectId: ports.publishedProjectId()
      });
      if (!result.ok) {
        if (!ports.redirectIfAuthRequired(result.cause) && ports.dialog() !== undefined) {
          ports.setDialog({ ...ports.dialog()!, busy: false, error: errorMessage(result.cause) });
        }
        return;
      }
      ports.setDialog({ mode: 'list', name: '', published: false, busy: false });
    } catch (error) {
      if (!ports.redirectIfAuthRequired(error) && ports.dialog() !== undefined) {
        ports.setDialog({ ...ports.dialog()!, busy: false, error: errorMessage(error) });
      }
    }
  };

  const confirmDelete = async (): Promise<void> => {
    const dialog = ports.dialog();
    if (dialog === undefined || dialog.busy || dialog.targetId === undefined) {
      return;
    }
    ports.setDialog({ ...dialog, busy: true, error: undefined });
    try {
      const result = await ports.commands.delete({
        projectId: dialog.targetId,
        publishedProjectId: ports.publishedProjectId()
      });
      if (!result.ok) {
        if (!ports.redirectIfAuthRequired(result.cause) && ports.dialog() !== undefined) {
          ports.setDialog({ ...ports.dialog()!, busy: false, error: errorMessage(result.cause) });
        }
        return;
      }
      const projectCount = await ports.acceptDeletedProject(dialog.targetId);
      ports.setDialog(projectCount === 0
        ? { mode: 'create', name: '', published: false, busy: false }
        : { mode: 'list', name: '', published: false, busy: false });
    } catch (error) {
      if (!ports.redirectIfAuthRequired(error) && ports.dialog() !== undefined) {
        ports.setDialog({ ...ports.dialog()!, busy: false, error: errorMessage(error) });
      }
    }
  };

  return {
    open(create = false) {
      ports.setDialog({
        mode: create || ports.projects().length === 0 ? 'create' : 'list',
        name: '',
        published: false,
        busy: false
      });
    },

    close,

    handle(intent) {
      const dialog = ports.dialog();
      if (dialog === undefined) {
        return;
      }
      switch (intent.type) {
        case 'close': close(); return;
        case 'new':
          ports.setDialog({ ...dialog, mode: 'create', name: '', published: false, error: undefined });
          return;
        case 'back':
          ports.setDialog({ mode: 'list', name: '', published: false, busy: false });
          return;
        case 'select':
          void ports.switchProject(intent.projectId).then(() => ports.setDialog(undefined));
          return;
        case 'edit': edit(intent.projectId); return;
        case 'delete': askDelete(intent.projectId); return;
        case 'name-change':
          ports.setDialog({
            ...dialog,
            name: intent.name,
            error: dialog.mode === 'create' ? undefined : dialog.error
          });
          return;
        case 'publication-change':
          ports.setDialog({ ...dialog, published: intent.published });
          return;
        case 'submit-create': void confirmCreate(); return;
        case 'submit-edit': void confirmEdit(); return;
        case 'submit-delete': void confirmDelete(); return;
      }
    }
  };
}
