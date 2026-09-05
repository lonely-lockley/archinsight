import { describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '$lib/storage';
import {
  createProjectController,
  type ProjectControllerPorts
} from './project-controller';

const createdProject: ProjectSummary = {
  id: 'created',
  name: 'Created project',
  created: '2026-08-31T12:00:00Z',
  fileCount: 0
};

const updatedProject: ProjectSummary = {
  id: 'project-1',
  name: 'Updated project',
  updated: '2026-08-31T13:00:00Z',
  fileCount: 2
};

const ports = (): ProjectControllerPorts => ({
  acceptCreatedProject: vi.fn(),
  acceptUpdatedProject: vi.fn(),
  acceptPublishedProjectId: vi.fn(),
  createProject: vi.fn(async () => createdProject),
  updateProject: vi.fn(async () => updatedProject),
  deleteProject: vi.fn(async () => undefined),
  publishToPlayground: vi.fn(async (projectId) => ({ repositoryId: projectId })),
  unpublishFromPlayground: vi.fn(async () => undefined)
});

describe('project controller', () => {
  it('creates a project without changing publication when publishing is not requested', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.create({
      name: 'Created project',
      publicationAllowed: true,
      published: false,
      publishedProjectId: 'other'
    });

    expect(adapter.createProject).toHaveBeenCalledWith('Created project');
    expect(adapter.acceptCreatedProject).toHaveBeenCalledWith(createdProject);
    expect(adapter.publishToPlayground).not.toHaveBeenCalled();
    expect(adapter.unpublishFromPlayground).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      project: createdProject,
      publishedProjectId: 'other'
    });
  });

  it('publishes a newly created project', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.create({
      name: 'Created project',
      publicationAllowed: true,
      published: true,
      publishedProjectId: 'old'
    });

    expect(adapter.publishToPlayground).toHaveBeenCalledWith('created');
    expect(adapter.acceptPublishedProjectId).toHaveBeenCalledWith('created');
    expect(result).toMatchObject({ ok: true, publishedProjectId: 'created' });
  });

  it('does not touch publication without the capability', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.create({
      name: 'Created project',
      publicationAllowed: false,
      published: true,
      publishedProjectId: 'old'
    });

    expect(adapter.publishToPlayground).not.toHaveBeenCalled();
    expect(adapter.unpublishFromPlayground).not.toHaveBeenCalled();
    expect(adapter.acceptPublishedProjectId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, publishedProjectId: 'old' });
  });

  it('reports create failures without attempting publication', async () => {
    const adapter = ports();
    vi.mocked(adapter.createProject).mockRejectedValueOnce(new Error('create failed'));
    const controller = createProjectController(adapter);

    const result = await controller.create({
      name: 'Created project',
      publicationAllowed: true,
      published: true,
      publishedProjectId: undefined
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'create',
      cause: expect.objectContaining({ message: 'create failed' }),
      publishedProjectId: undefined
    });
    expect(adapter.publishToPlayground).not.toHaveBeenCalled();
    expect(adapter.acceptCreatedProject).not.toHaveBeenCalled();
  });

  it('returns the created project when publication fails', async () => {
    const adapter = ports();
    vi.mocked(adapter.publishToPlayground).mockRejectedValueOnce(new Error('publish failed'));
    const controller = createProjectController(adapter);

    const result = await controller.create({
      name: 'Created project',
      publicationAllowed: true,
      published: true,
      publishedProjectId: 'old'
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'publication',
      project: createdProject,
      cause: expect.objectContaining({ message: 'publish failed' }),
      publishedProjectId: 'old'
    });
    expect(adapter.acceptCreatedProject).toHaveBeenCalledWith(createdProject);
  });

  it('updates a project and publishes it', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.update({
      projectId: 'project-1',
      name: 'Updated project',
      publicationAllowed: true,
      published: true,
      publishedProjectId: undefined
    });

    expect(adapter.updateProject).toHaveBeenCalledWith('project-1', 'Updated project');
    expect(adapter.acceptUpdatedProject).toHaveBeenCalledWith(updatedProject);
    expect(adapter.publishToPlayground).toHaveBeenCalledWith('project-1');
    expect(result).toEqual({
      ok: true,
      project: updatedProject,
      publishedProjectId: 'project-1'
    });
  });

  it('unpublishes an updated project when requested', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.update({
      projectId: 'project-1',
      name: 'Updated project',
      publicationAllowed: true,
      published: false,
      publishedProjectId: 'project-1'
    });

    expect(adapter.unpublishFromPlayground).toHaveBeenCalledOnce();
    expect(adapter.acceptPublishedProjectId).toHaveBeenCalledWith(undefined);
    expect(result).toMatchObject({ ok: true, publishedProjectId: undefined });
  });

  it('reports update failure without changing publication', async () => {
    const adapter = ports();
    vi.mocked(adapter.updateProject).mockRejectedValueOnce(new Error('update failed'));
    const controller = createProjectController(adapter);

    const result = await controller.update({
      projectId: 'project-1',
      name: 'Updated project',
      publicationAllowed: true,
      published: false,
      publishedProjectId: 'project-1'
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'update',
      cause: expect.objectContaining({ message: 'update failed' }),
      publishedProjectId: 'project-1'
    });
    expect(adapter.unpublishFromPlayground).not.toHaveBeenCalled();
    expect(adapter.acceptUpdatedProject).not.toHaveBeenCalled();
  });

  it('returns the updated project when its publication change fails', async () => {
    const adapter = ports();
    vi.mocked(adapter.unpublishFromPlayground).mockRejectedValueOnce(new Error('unpublish failed'));
    const controller = createProjectController(adapter);

    const result = await controller.update({
      projectId: 'project-1',
      name: 'Updated project',
      publicationAllowed: true,
      published: false,
      publishedProjectId: 'project-1'
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'publication',
      project: updatedProject,
      cause: expect.objectContaining({ message: 'unpublish failed' }),
      publishedProjectId: 'project-1'
    });
    expect(adapter.acceptUpdatedProject).toHaveBeenCalledWith(updatedProject);
  });

  it('unpublishes before deleting the published project', async () => {
    const adapter = ports();
    const order: string[] = [];
    vi.mocked(adapter.unpublishFromPlayground).mockImplementationOnce(async () => {
      order.push('unpublish');
    });
    vi.mocked(adapter.acceptPublishedProjectId).mockImplementationOnce(() => {
      order.push('accept-publication');
    });
    vi.mocked(adapter.deleteProject).mockImplementationOnce(async () => {
      order.push('delete');
    });
    const controller = createProjectController(adapter);

    const result = await controller.delete({
      projectId: 'project-1',
      publishedProjectId: 'project-1'
    });

    expect(order).toEqual(['unpublish', 'accept-publication', 'delete']);
    expect(result).toEqual({ ok: true, publishedProjectId: undefined });
  });

  it('deletes an unpublished project without touching publication', async () => {
    const adapter = ports();
    const controller = createProjectController(adapter);

    const result = await controller.delete({
      projectId: 'project-1',
      publishedProjectId: 'other'
    });

    expect(adapter.unpublishFromPlayground).not.toHaveBeenCalled();
    expect(adapter.deleteProject).toHaveBeenCalledWith('project-1');
    expect(result).toEqual({ ok: true, publishedProjectId: 'other' });
  });

  it('does not delete when unpublishing fails', async () => {
    const adapter = ports();
    vi.mocked(adapter.unpublishFromPlayground).mockRejectedValueOnce(new Error('unpublish failed'));
    const controller = createProjectController(adapter);

    const result = await controller.delete({
      projectId: 'project-1',
      publishedProjectId: 'project-1'
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'publication',
      cause: expect.objectContaining({ message: 'unpublish failed' }),
      publishedProjectId: 'project-1'
    });
    expect(adapter.deleteProject).not.toHaveBeenCalled();
  });

  it('preserves successful unpublication when deleting then fails', async () => {
    const adapter = ports();
    vi.mocked(adapter.deleteProject).mockRejectedValueOnce(new Error('delete failed'));
    const controller = createProjectController(adapter);

    const result = await controller.delete({
      projectId: 'project-1',
      publishedProjectId: 'project-1'
    });

    expect(result).toMatchObject({
      ok: false,
      stage: 'delete',
      cause: expect.objectContaining({ message: 'delete failed' }),
      publishedProjectId: undefined
    });
  });
});
