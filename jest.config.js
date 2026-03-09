/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.server.json',
      diagnostics: false,
    }],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testTimeout: 30000,
  verbose: true,
  // Run serially so we don't get port collisions
  maxWorkers: 1,
};
