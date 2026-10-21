module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
  reportUnusedDisableDirectives: true,
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'warn',
    // Repo convention: max 79 chars per line (AGENTS.md).
    'max-len': ['error', { code: 79 }],
    // Elevated from the 'warn' that react-hooks/recommended
    // ships — a missed dep is a stale-closure bug.
    'react-hooks/exhaustive-deps': 'error',
    // Fire-and-forget promises must be marked `void` — an
    // unmarked floating promise is usually a missing await.
    // Requires parserOptions.project (typed lint).
    '@typescript-eslint/no-floating-promises': 'error',
  },
}
