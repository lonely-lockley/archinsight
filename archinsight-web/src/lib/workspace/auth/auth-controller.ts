import { AuthRequiredError, type AuthUserResponse } from '$lib/api';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import { errorMessage } from '../messages/message-controller';

export type AuthControllerPorts = {
  surface(): WorkspaceSurface;
  currentUser(): AuthUserResponse;
  setCurrentUser(user: AuthUserResponse): void;
  fetchCurrentUser(): Promise<AuthUserResponse>;
  logoutCurrentUser(): Promise<void>;
  clearLocalWorkspaceStorage(): void;
  routePath(path: string): string;
  currentLocation(): string;
  navigate(href: string): void;
  error(message: string): void;
};

export type AuthController = {
  authorizeWorkspace(): Promise<boolean>;
  refreshCurrentUser(): Promise<boolean>;
  login(): void;
  logout(): Promise<void>;
  redirectIfAuthRequired(error: unknown): boolean;
  loginRoute(): string;
};

export function createAuthController(ports: AuthControllerPorts): AuthController {
  const loginRoute = (): string => (
    `${ports.routePath('/login')}?returnTo=${encodeURIComponent(ports.currentLocation())}`
  );

  const redirectIfAuthRequired = (error: unknown): boolean => {
    if (!(error instanceof AuthRequiredError)) return false;
    ports.navigate(loginRoute());
    return true;
  };

  const refreshCurrentUser = async (): Promise<boolean> => {
    try {
      ports.setCurrentUser(await ports.fetchCurrentUser());
      return true;
    } catch (error) {
      if (redirectIfAuthRequired(error)) return false;
      ports.setCurrentUser({ authenticated: false });
      ports.error(`Auth error: ${errorMessage(error)}`);
      return true;
    }
  };

  return {
    async authorizeWorkspace() {
      const loaded = await refreshCurrentUser();
      if (!loaded) return false;
      if (ports.surface() === 'editor' && !ports.currentUser().authenticated) {
        ports.navigate(loginRoute());
        return false;
      }
      return true;
    },

    refreshCurrentUser,

    login() {
      ports.navigate(loginRoute());
    },

    async logout() {
      try {
        await ports.logoutCurrentUser();
        ports.clearLocalWorkspaceStorage();
        ports.setCurrentUser({ authenticated: false });
        ports.navigate('/');
      } catch (error) {
        if (!redirectIfAuthRequired(error)) {
          ports.error(`Logout failed: ${errorMessage(error)}`);
        }
      }
    },

    redirectIfAuthRequired,
    loginRoute
  };
}
