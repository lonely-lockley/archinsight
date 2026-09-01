import type { ProjectSummary } from '$lib/storage';

export type ProjectControllerPorts = {
  acceptCreatedProject(project: ProjectSummary): void;
  acceptUpdatedProject(project: ProjectSummary): void;
  acceptPublishedProjectId(projectId: string | undefined): void;
  createProject(name: string): Promise<ProjectSummary>;
  updateProject(projectId: string, name: string): Promise<ProjectSummary>;
  deleteProject(projectId: string): Promise<void>;
  publishToPlayground(projectId: string): Promise<{ readonly repositoryId: string }>;
  unpublishFromPlayground(): Promise<void>;
};

type PublicationInput = {
  readonly publicationAllowed: boolean;
  readonly published: boolean;
  readonly publishedProjectId: string | undefined;
};

export type CreateProjectResult =
  | {
      readonly ok: true;
      readonly project: ProjectSummary;
      readonly publishedProjectId: string | undefined;
    }
  | {
      readonly ok: false;
      readonly stage: 'create';
      readonly cause: unknown;
      readonly publishedProjectId: string | undefined;
    }
  | {
      readonly ok: false;
      readonly stage: 'publication';
      readonly cause: unknown;
      readonly project: ProjectSummary;
      readonly publishedProjectId: string | undefined;
    };

export type UpdateProjectResult =
  | {
      readonly ok: true;
      readonly project: ProjectSummary;
      readonly publishedProjectId: string | undefined;
    }
  | {
      readonly ok: false;
      readonly stage: 'update';
      readonly cause: unknown;
      readonly publishedProjectId: string | undefined;
    }
  | {
      readonly ok: false;
      readonly stage: 'publication';
      readonly cause: unknown;
      readonly project: ProjectSummary;
      readonly publishedProjectId: string | undefined;
    };

export type DeleteProjectResult =
  | {
      readonly ok: true;
      readonly publishedProjectId: string | undefined;
    }
  | {
      readonly ok: false;
      readonly stage: 'publication' | 'delete';
      readonly cause: unknown;
      readonly publishedProjectId: string | undefined;
    };

export type ProjectController = {
  create(input: PublicationInput & {
    readonly name: string;
  }): Promise<CreateProjectResult>;
  update(input: PublicationInput & {
    readonly projectId: string;
    readonly name: string;
  }): Promise<UpdateProjectResult>;
  delete(input: {
    readonly projectId: string;
    readonly publishedProjectId: string | undefined;
  }): Promise<DeleteProjectResult>;
};

export function createProjectController(ports: ProjectControllerPorts): ProjectController {
  const applyPublication = async (
    projectId: string,
    input: PublicationInput
  ): Promise<string | undefined> => {
    if (!input.publicationAllowed) {
      return input.publishedProjectId;
    }
    if (input.published && input.publishedProjectId !== projectId) {
      const publication = await ports.publishToPlayground(projectId);
      ports.acceptPublishedProjectId(publication.repositoryId);
      return publication.repositoryId;
    }
    if (!input.published && input.publishedProjectId === projectId) {
      await ports.unpublishFromPlayground();
      ports.acceptPublishedProjectId(undefined);
      return undefined;
    }
    return input.publishedProjectId;
  };

  return {
    async create(input) {
      let project: ProjectSummary;
      try {
        project = await ports.createProject(input.name);
      } catch (cause) {
        return {
          ok: false,
          stage: 'create',
          cause,
          publishedProjectId: input.publishedProjectId
        };
      }
      ports.acceptCreatedProject(project);
      try {
        const publishedProjectId = await applyPublication(project.id, input);
        return { ok: true, project, publishedProjectId };
      } catch (cause) {
        return {
          ok: false,
          stage: 'publication',
          cause,
          project,
          publishedProjectId: input.publishedProjectId
        };
      }
    },

    async update(input) {
      let project: ProjectSummary;
      try {
        project = await ports.updateProject(input.projectId, input.name);
      } catch (cause) {
        return {
          ok: false,
          stage: 'update',
          cause,
          publishedProjectId: input.publishedProjectId
        };
      }
      ports.acceptUpdatedProject(project);
      try {
        const publishedProjectId = await applyPublication(input.projectId, input);
        return { ok: true, project, publishedProjectId };
      } catch (cause) {
        return {
          ok: false,
          stage: 'publication',
          cause,
          project,
          publishedProjectId: input.publishedProjectId
        };
      }
    },

    async delete({ projectId, publishedProjectId }) {
      let nextPublishedProjectId = publishedProjectId;
      if (publishedProjectId === projectId) {
        try {
          await ports.unpublishFromPlayground();
          nextPublishedProjectId = undefined;
          ports.acceptPublishedProjectId(undefined);
        } catch (cause) {
          return {
            ok: false,
            stage: 'publication',
            cause,
            publishedProjectId
          };
        }
      }
      try {
        await ports.deleteProject(projectId);
        return { ok: true, publishedProjectId: nextPublishedProjectId };
      } catch (cause) {
        return {
          ok: false,
          stage: 'delete',
          cause,
          publishedProjectId: nextPublishedProjectId
        };
      }
    }
  };
}
