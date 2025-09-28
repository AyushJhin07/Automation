import assert from 'node:assert/strict';

process.env.NODE_ENV = 'development';

const { AuthService } = await import('../AuthService.js');
const { users } = await import('../../database/schema.js');

interface MockUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name?: string;
  role: string;
  planType: string;
  isActive: boolean;
  emailVerified: boolean;
  monthlyApiCalls: number;
  monthlyTokensUsed: number;
  quotaApiCalls: number;
  quotaTokens: number;
}

const mockUsers: MockUserRecord[] = [];

const mockDb = {
  insert(table: unknown) {
    if (table !== users) {
      throw new Error('Mock DB only supports inserting into users table for this test');
    }

    return {
      values(value: any) {
        const record: MockUserRecord = {
          id: `user-${mockUsers.length + 1}`,
          email: value.email,
          passwordHash: value.passwordHash,
          name: value.name,
          role: value.role,
          planType: value.planType,
          isActive: value.isActive ?? true,
          emailVerified: value.emailVerified ?? false,
          monthlyApiCalls: value.monthlyApiCalls ?? 0,
          monthlyTokensUsed: value.monthlyTokensUsed ?? 0,
          quotaApiCalls: value.quotaApiCalls ?? 0,
          quotaTokens: value.quotaTokens ?? 0,
        };

        mockUsers.push(record);

        return {
          returning(selection?: Record<string, unknown>) {
            return [mapSelection(record, selection)];
          },
        };
      },
    };
  },
};

function mapSelection(record: MockUserRecord, selection?: Record<string, unknown>) {
  if (!selection) {
    return record;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(selection)) {
    result[key] = (record as any)[key];
  }
  return result;
}

const authService = new AuthService();
(authService as any).db = mockDb;
(authService as any).getUserByEmail = async (email: string) => {
  return mockUsers.find((user) => user.email === email.toLowerCase()) ?? null;
};
(authService as any).getUserById = async (userId: string) => {
  return mockUsers.find((user) => user.id === userId) ?? null;
};
(authService as any).generateTokens = async () => ({
  token: 'token',
  refreshToken: 'refresh-token',
  expiresAt: new Date(Date.now() + 60_000),
});
(authService as any).updateLastLogin = async () => {};

const registration = await authService.register({
  email: 'new-user@example.com',
  password: 'ValidPass123',
  name: 'Example User',
});

assert.equal(registration.success, true, 'registration should succeed');
assert.equal(mockUsers.length, 1, 'a user record should be stored');
assert.equal(mockUsers[0].emailVerified, false, 'new accounts default to unverified');

const login = await authService.login({
  email: 'new-user@example.com',
  password: 'ValidPass123',
});

assert.equal(login.success, true, 'login should succeed for newly created user');
assert.equal(login.user?.emailVerified, false, 'login response reflects verification state');
assert.ok(login.token, 'login returns an access token');

console.log('AuthService register/login keep emailVerified defaults intact.');
