export type AuthLoginOption = {
  id: string;
  label: string;
  url: string;
};

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  tokenVersion: number;
  roles: AppRole[];
};

export type AppRole = 'user' | 'playground_admin';

export type AppCapability =
  | 'repository:read-own'
  | 'repository:write-own'
  | 'publication:manage';

export type UserdataProfile = {
  id?: string | null;
  originId?: string | null;
  email: string;
  emailVerified?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  source?: string | null;
  locale?: string | null;
  ssrSession?: string | null;
};

export type AuthUserResponse = {
  authenticated: boolean;
  id?: string | null;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  loginUrl?: string | null;
  logoutUrl?: string | null;
  loginOptions?: AuthLoginOption[] | null;
  roles?: AppRole[];
  capabilities?: AppCapability[];
};

export type StandaloneTokenConfig = {
  secret: string;
  issuer: string;
  audience: string;
  ttlMinutes: number;
};

export type StandaloneTokenClaims = {
  userId: string;
  tokenVersion: number;
  email?: string | null;
  displayName?: string | null;
  avatar?: string | null;
};
