import type { AppCapability, AuthenticatedUser } from './types';
import { forbidden } from '$lib/server/errors/application-error';

export type AuthorizationReason = 'authentication-required' | 'missing-capability' | 'not-owner';

export type AuthorizationDecision =
  | { permitted: true }
  | { permitted: false; reason: AuthorizationReason };

const roleCapabilities = {
  user: ['repository:read-own', 'repository:write-own'],
  playground_admin: ['publication:manage']
} as const satisfies Record<string, readonly AppCapability[]>;

export function capabilitiesFor(user: AuthenticatedUser): AppCapability[] {
  const capabilities = new Set<AppCapability>();
  for (const role of user.roles) {
    for (const capability of roleCapabilities[role]) {
      capabilities.add(capability);
    }
  }
  return [...capabilities];
}

export function authorize(user: AuthenticatedUser | null, capability: AppCapability): AuthorizationDecision {
  if (!user) {
    return { permitted: false, reason: 'authentication-required' };
  }
  return capabilitiesFor(user).includes(capability)
    ? { permitted: true }
    : { permitted: false, reason: 'missing-capability' };
}

export function requireCapability(user: AuthenticatedUser, capability: AppCapability): void {
  const decision = authorize(user, capability);
  if (!decision.permitted) {
    throw forbidden('Forbidden', { cause: decision.reason });
  }
}

export function requireOwner(user: AuthenticatedUser, ownerId: string): void {
  if (user.id !== ownerId) {
    throw forbidden('Forbidden', { cause: 'not-owner' });
  }
}
