import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, type AuthUserResponse } from '$lib/api';
import { createAuthController, type AuthControllerPorts } from './auth-controller';

function fixture(surface: 'editor' | 'playground' = 'editor') {
  let user: AuthUserResponse = { authenticated: false };
  const ports: AuthControllerPorts = {
    surface: () => surface,
    currentUser: () => user,
    setCurrentUser: (next) => { user = next; },
    fetchCurrentUser: vi.fn(async () => ({ authenticated: true, displayName: 'Ada' })),
    logoutCurrentUser: vi.fn(async () => undefined),
    clearLocalWorkspaceStorage: vi.fn(),
    routePath: (path) => `/base${path}`,
    currentLocation: () => '/editor?tab=main#source',
    navigate: vi.fn(),
    error: vi.fn()
  };
  return { ports, controller: createAuthController(ports), user: () => user };
}

describe('auth controller', () => {
  it('authorizes an authenticated editor session', async () => {
    const subject = fixture();
    expect(await subject.controller.authorizeWorkspace()).toBe(true);
    expect(subject.user()).toMatchObject({ authenticated: true, displayName: 'Ada' });
    expect(subject.ports.navigate).not.toHaveBeenCalled();
  });

  it('redirects an anonymous editor while allowing anonymous playground access', async () => {
    const editor = fixture();
    vi.mocked(editor.ports.fetchCurrentUser).mockResolvedValueOnce({ authenticated: false });
    expect(await editor.controller.authorizeWorkspace()).toBe(false);
    expect(editor.ports.navigate).toHaveBeenCalledWith(
      '/base/login?returnTo=%2Feditor%3Ftab%3Dmain%23source'
    );

    const playground = fixture('playground');
    vi.mocked(playground.ports.fetchCurrentUser).mockResolvedValueOnce({ authenticated: false });
    expect(await playground.controller.authorizeWorkspace()).toBe(true);
  });

  it('reports recoverable auth lookup failures without blocking playground startup', async () => {
    const subject = fixture('playground');
    vi.mocked(subject.ports.fetchCurrentUser).mockRejectedValueOnce(new Error('identity offline'));
    expect(await subject.controller.authorizeWorkspace()).toBe(true);
    expect(subject.user()).toEqual({ authenticated: false });
    expect(subject.ports.error).toHaveBeenCalledWith('Auth error: identity offline');
  });

  it('recognizes auth-required failures and centralizes the login redirect', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.fetchCurrentUser).mockRejectedValueOnce(new AuthRequiredError());
    expect(await subject.controller.authorizeWorkspace()).toBe(false);
    expect(subject.controller.redirectIfAuthRequired(new Error('other'))).toBe(false);
    subject.controller.login();
    expect(subject.ports.navigate).toHaveBeenLastCalledWith(subject.controller.loginRoute());
  });

  it('clears local state only after a successful logout', async () => {
    const subject = fixture();
    await subject.controller.refreshCurrentUser();
    await subject.controller.logout();
    expect(subject.ports.clearLocalWorkspaceStorage).toHaveBeenCalledOnce();
    expect(subject.user()).toEqual({ authenticated: false });
    expect(subject.ports.navigate).toHaveBeenLastCalledWith('/');
  });

  it('keeps the workspace intact and reports a failed logout', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.logoutCurrentUser).mockRejectedValueOnce(new Error('logout offline'));
    await subject.controller.logout();
    expect(subject.ports.clearLocalWorkspaceStorage).not.toHaveBeenCalled();
    expect(subject.ports.error).toHaveBeenCalledWith('Logout failed: logout offline');
  });
});
