import { baseConfig } from '@pointshub/config/eslint/base';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  // CLI scripts report progress on stdout.
  { files: ['prisma/**/*.ts'], rules: { 'no-console': 'off' } },
];
