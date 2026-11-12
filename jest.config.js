/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: [],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/data/(.*)$': '<rootDir>/src/data/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
  },
  testEnvironment: 'node',
};