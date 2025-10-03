/** @type {import('jest').Config} */
module.exports = {
  moduleNameMapper: {
    '^(?:\.\./)+oauth/OAuthManager$': '<rootDir>/server/oauth/__mocks__/OAuthManager.ts',
    '^server/oauth/OAuthManager$': '<rootDir>/server/oauth/__mocks__/OAuthManager.ts',
  },
};
