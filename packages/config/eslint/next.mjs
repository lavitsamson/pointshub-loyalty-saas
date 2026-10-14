import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { baseConfig } from './base.mjs';

/**
 * Flat config for the Next.js app: base TypeScript rules plus Next and React hooks rules.
 * @param {{ tsconfigRootDir: string }} options
 */
export function nextConfig({ tsconfigRootDir }) {
  return [
    ...baseConfig({ tsconfigRootDir }),
    {
      languageOptions: { globals: { ...globals.browser } },
      plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        ...reactHooks.configs.recommended.rules,
        'no-console': 'warn',
        // Event handlers such as onSubmit={form.handleSubmit(save)} legitimately return promises.
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ];
}
