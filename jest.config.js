/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
