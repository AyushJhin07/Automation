export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'workflow:create'
  | 'workflow:view'
  | 'workflow:edit'
  | 'workflow:deploy'
  | 'workflow:delete'
  | 'workflow:collaborate'
  | 'connections:read'
  | 'connections:write'
  | 'integration:metadata:read'
  | 'organization:invite_member'
  | 'organization:remove_member'
  | 'organization:manage_roles'
  | 'organization:view_usage'
  | 'organization:manage_security'
  | 'organization:view_security_audit'
  | 'billing:manage';

export interface RolePermissionMatrix {
  description: string;
  permissions: Permission[];
}

const OWNER_PERMISSIONS: Permission[] = [
  'workflow:create',
  'workflow:view',
  'workflow:edit',
  'workflow:deploy',
  'workflow:delete',
  'workflow:collaborate',
  'connections:read',
  'connections:write',
  'integration:metadata:read',
  'organization:invite_member',
  'organization:remove_member',
  'organization:manage_roles',
  'organization:view_usage',
  'organization:manage_security',
  'organization:view_security_audit',
  'billing:manage',
];

const ADMIN_PERMISSIONS: Permission[] = OWNER_PERMISSIONS.filter(
  (permission) => permission !== 'billing:manage'
);

const MEMBER_PERMISSIONS: Permission[] = [
  'workflow:create',
  'workflow:view',
  'workflow:edit',
  'workflow:deploy',
  'workflow:collaborate',
  'connections:read',
  'connections:write',
  'integration:metadata:read',
  'organization:view_usage',
];

const VIEWER_PERMISSIONS: Permission[] = [
  'workflow:view',
  'organization:view_usage',
  'integration:metadata:read',
];

export const ROLE_PERMISSIONS: Record<OrgRole, RolePermissionMatrix> = {
  owner: {
    description: 'Full access to manage organization settings and billing',
    permissions: OWNER_PERMISSIONS,
  },
  admin: {
    description: 'Manage workflows, connections, and members (excluding billing)',
    permissions: ADMIN_PERMISSIONS,
  },
  member: {
    description: 'Build and deploy workflows and manage personal connections',
    permissions: MEMBER_PERMISSIONS,
  },
  viewer: {
    description: 'Read-only access to workflows and analytics',
    permissions: VIEWER_PERMISSIONS,
  },
};

const FALLBACK_PERMISSIONS: Permission[] = ['workflow:view'];

export function getPermissionsForRole(role?: string | null): Permission[] {
  if (!role) {
    return FALLBACK_PERMISSIONS;
  }

  const normalized = role.toLowerCase() as OrgRole;
  if (normalized in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[normalized as OrgRole].permissions;
  }

  return FALLBACK_PERMISSIONS;
}

export function hasPermission(role: string | undefined | null, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
