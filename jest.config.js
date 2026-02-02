export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.js'],
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json'],
  verbose: true,
  testTimeout: 30000,
};
