import { baseConfig } from '@pointshub/config/eslint/base';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  // CLI scripts report their results on stdout.
  { files: ['scripts/**/*.ts'], rules: { 'no-console': 'off' } },
];
