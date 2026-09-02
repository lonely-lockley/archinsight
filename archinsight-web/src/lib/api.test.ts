import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractValidationError } from '@archinsight/contracts';
import {
  ApiError,
  AuthRequiredError,
  createFolder,
  createProject,
  deleteFolder,
  deleteFile,
  deleteProject,
  fetchCurrentUser,
  fetchFile,
  fetchPlaygroundPublication,
  fetchProjectStructure,
  fetchProjectSymbols,
  fetchProjects,
  fetchTree,
  linkProject,
  logoutCurrentUser,
  publishToPlayground,
  renameFile,
  renameFolder,
  renderProjectSvg,
  routePath,
  saveFile,
  unpublishFromPlayground,
  updateProject
} from './api';

const fetchMock = vi.fn<typeof fetch>();

describe('web API client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects editor and playground collection routes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ projects: [] }))
      .mockResolvedValueOnce(jsonResponse({ projects: [] }));

    await fetchProjects('editor');
    await fetchProjects('playground');

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/api\/projects$/), {
      credentials: 'include'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/api\/playground$/), {
      credentials: 'include'
    });
  });

  it('encodes identifiers and sends JSON mutation requests', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(projectSummary('new', 'New')))
      .mockResolvedValueOnce(jsonResponse(projectSummary('a/b', 'Renamed')))
      .mockResolvedValueOnce(jsonResponse({ path: 'models/a b.ai', revision: '2' }));

    await createProject('New');
    await updateProject('a/b', 'Renamed');
    await saveFile('a/b', 'models/a b.ai', { content: 'context demo' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/api\/projects$/), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: 'New' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/api\/projects\/a%2Fb$/), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: 'Renamed' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/\/api\/projects\/a%2Fb\/files\/content\?path=models%2Fa%20b\.ai$/),
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: 'context demo' })
      }
    );
  });

  it('maps every public workspace operation to its HTTP endpoint and method', async () => {
    const operations = [
      {
        invoke: () => fetchTree('a/b'),
        url: /\/api\/projects\/a%2Fb\/files$/,
        method: 'GET',
        response: fileTree()
      },
      {
        invoke: () => fetchTree('ignored', 'playground'),
        url: /\/api\/playground\/files$/,
        method: 'GET',
        response: fileTree()
      },
      {
        invoke: () => fetchFile('a/b', 'model one.ai'),
        url: /\/api\/projects\/a%2Fb\/files\/content\?path=model%20one\.ai$/,
        method: 'GET',
        response: { path: 'model one.ai', content: '', readOnly: false, revision: '1' }
      },
      {
        invoke: () => renameFile('demo', 'old.ai', 'new.ai'),
        url: /\/api\/projects\/demo\/files\/rename$/,
        method: 'POST',
        response: { path: 'new.ai', revision: '1' }
      },
      {
        invoke: () => createFolder('demo', 'models'),
        url: /\/api\/projects\/demo\/folders$/,
        method: 'POST',
        response: { path: 'models', revision: '1' }
      },
      {
        invoke: () => renameFolder('demo', 'old', 'new'),
        url: /\/api\/projects\/demo\/folders\/rename$/,
        method: 'POST',
        response: { path: 'new', revision: '1' }
      },
      {
        invoke: () => fetchProjectStructure('demo', { 'model.ai': 'context demo' }),
        url: /\/api\/projects\/demo\/structure$/,
        method: 'POST',
        response: projectStructure()
      },
      {
        invoke: () => linkProject('demo', ['model.ai'], {}, '', 'c2', undefined),
        url: /\/api\/projects\/demo\/link$/,
        method: 'POST',
        response: linkResponse()
      },
      {
        invoke: () => renderProjectSvg('demo', []),
        url: /\/api\/projects\/demo\/render\/svg$/,
        method: 'POST',
        response: { diagnostics: [], svgs: [] }
      },
      {
        invoke: () => fetchPlaygroundPublication(),
        url: /\/api\/admin\/playground\/publication$/,
        method: 'GET',
        response: null
      },
      {
        invoke: () => publishToPlayground('demo'),
        url: /\/api\/admin\/playground\/publication$/,
        method: 'PUT',
        response: publication()
      },
      {
        invoke: () => fetchCurrentUser(),
        url: /\/api\/auth\/me$/,
        method: 'GET',
        response: { authenticated: false }
      }
    ];

    for (const operation of operations) {
      fetchMock.mockResolvedValueOnce(jsonResponse(operation.response));
      await operation.invoke();
      const [url, init] = fetchMock.mock.lastCall!;
      expect(String(url)).toMatch(operation.url);
      expect(init?.method ?? 'GET').toBe(operation.method);
      expect(init?.credentials).toBe('include');
    }
  });

  it('maps destructive operations without attempting to parse empty responses', async () => {
    const operations = [
      { invoke: () => deleteProject('a/b'), url: /\/api\/projects\/a%2Fb$/ },
      { invoke: () => deleteFolder('demo', 'models/a b'), url: /\/api\/projects\/demo\/folders\?path=models%2Fa%20b$/ },
      { invoke: () => unpublishFromPlayground(), url: /\/api\/admin\/playground\/publication$/ },
      { invoke: () => logoutCurrentUser(), url: /\/api\/auth\/logout$/ }
    ];

    for (const operation of operations) {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
      await operation.invoke();
      const [url, init] = fetchMock.mock.lastCall!;
      expect(String(url)).toMatch(operation.url);
      expect(init?.method).toMatch(/DELETE|POST/);
      expect(init?.credentials).toBe('include');
    }
  });

  it('uses the same authentication error for read, write, and delete requests', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    await expect(fetchProjects()).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(createProject('New')).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(deleteFile('demo', 'model.ai')).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('prefers structured server errors and removes stack lines', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'Invalid model\nat handler',
        code: 'INVALID_REQUEST',
        correlationId: 'request-123'
      }), {
        status: 400,
        statusText: 'Bad Request'
      }))
      .mockResolvedValueOnce(new Response('at internal\nReadable failure\nat handler', {
        status: 500,
        statusText: 'Server Error'
      }));

    await expect(fetchProjects()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid model',
      status: 400,
      code: 'INVALID_REQUEST',
      correlationId: 'request-123'
    } satisfies Partial<ApiError>);
    await expect(createProject('New')).rejects.toThrow('Readable failure');
  });

  it('falls back to HTTP status when an error response has no body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503, statusText: 'Unavailable' }));
    await expect(fetchProjects()).rejects.toThrow('503 Unavailable');
  });

  it('rejects malformed successful responses at the HTTP trust boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ projects: [{ id: 'broken', name: 'Broken' }] }));

    await expect(fetchProjects()).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('normalizes optional symbol fields at the HTTP boundary', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      schemaVersion: 'language.v1',
      types: [
        { name: 'Element', baseType: null, attributes: [] },
        {
          name: 'Service',
          baseType: 'Element',
          attributes: [{
            name: 'owner',
            type: 'Text',
            listElementType: null,
            required: false,
            list: false
          }]
        }
      ],
      constructors: [],
      operators: [{
        spelling: '->',
        ownerType: 'Element',
        leftType: null,
        targetType: 'Element'
      }],
      enums: []
    }));

    await expect(fetchProjectSymbols('demo')).resolves.toEqual({
      schemaVersion: 'language.v1',
      types: [
        { name: 'Element' },
        {
          name: 'Service',
          baseType: 'Element',
          attributes: [{ name: 'owner', type: 'Text', required: false, list: false }]
        }
      ],
      constructors: [],
      operators: [{ spelling: '->', ownerType: 'Element', targetType: 'Element' }],
      enums: []
    });
  });

  it('builds application-relative routes with exactly one separator', () => {
    expect(routePath('editor')).toMatch(/\/editor$/);
    expect(routePath('/editor')).toBe(routePath('editor'));
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function projectSummary(id: string, name: string) {
  return { id, name, created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z', fileCount: 0 };
}

function fileTree() {
  return { root: { name: 'Project', path: '', type: 'directory', children: [] } };
}

function projectStructure() {
  return { schemaVersion: 'project-structure.v1', contexts: [] };
}

function linkResponse() {
  return {
    revision: '1',
    analysis: { mode: 'full', relinkedSources: 0 },
    symbols: { schemaVersion: 'language.v1', types: [], constructors: [], operators: [], enums: [] },
    linkedModel: {
      diagnostics: [],
      contexts: [],
      elements: [],
      imports: [],
      edges: [],
      tabRoots: {},
      duplicateEdges: [],
      presentations: {},
      graph: { nodes: [], relations: [] }
    },
    diagnostics: [],
    renders: [],
    structure: projectStructure()
  };
}

function publication() {
  return {
    slot: 'default',
    repositoryId: 'demo',
    ownerId: 'owner',
    publishedBy: 'owner',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}
