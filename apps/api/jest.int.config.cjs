/** Integration tests: real Postgres, Redis and RabbitMQ via Testcontainers. */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [151002] } }],
  },
  testTimeout: 120_000,
};
