import { describe, expect, it } from 'vitest';
import { authorize, capabilitiesFor, requireOwner } from './authorization';
import type { AuthenticatedUser } from './types';

const user: AuthenticatedUser = {
  id: 'user-1',
  tokenVersion: 1,
  roles: ['user']
};

describe('RBAC authorization', () => {
  it('keeps playground administration as an additive capability', () => {
    const admin: AuthenticatedUser = { ...user, roles: ['user', 'playground_admin'] };

    expect(capabilitiesFor(user)).toEqual(['repository:read-own', 'repository:write-own']);
    expect(capabilitiesFor(admin)).toEqual([
      'repository:read-own',
      'repository:write-own',
      'publication:manage'
    ]);
  });

  it('does not grant publication management to a regular user', () => {
    expect(authorize(user, 'publication:manage')).toEqual({ permitted: false, reason: 'missing-capability' });
  });

  it('does not let an administrative capability bypass ownership', () => {
    expect(() => requireOwner({ ...user, roles: ['user', 'playground_admin'] }, 'someone-else'))
      .toThrow(Response);
  });
});
