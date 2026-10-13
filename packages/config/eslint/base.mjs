import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config for TypeScript packages.
 * @param {{ tsconfigRootDir: string }} options
 */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        'coverage/**',
        '.next/**',
        'src/generated/**',
        'next-env.d.ts',
        '**/*.config.{js,mjs,cjs}',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
      },
    },
    {
      // HTTP response bodies in tests are untyped by design: the test asserts their shape.
      files: ['**/*.spec.ts', '**/*.test.ts', '**/*.int-spec.ts', 'test/**/*.ts', 'e2e/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    prettier,
  );
}
