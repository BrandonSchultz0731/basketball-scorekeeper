import tseslint from 'typescript-eslint';

// Repo code standards (see .claude/skills/developing-code/SKILL.md).
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/', 'training/'] },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Enum names and members are both UPPER_SNAKE_CASE: `HOOP.LEFT`, `LABEL_EVENT_KIND.GAME_START`.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'enum', format: ['UPPER_CASE'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
      ],
      // Arrow functions only. Generators are allowed since they have no arrow form.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[generator=false]',
          message: 'Use an arrow function: `const name = (...) => { ... }`.',
        },
        {
          selector: 'FunctionExpression[generator=false]',
          message: 'Use an arrow function instead of a function expression.',
        },
        {
          // `type Hoop = 'left' | 'right'` -> `enum HOOP { LEFT = 'left', RIGHT = 'right' }`
          selector: 'TSUnionType > TSLiteralType > Literal[raw=/^[\'"]/]',
          message: 'Use a string enum instead of a union of string literals.',
        },
      ],
      // Import shared code through each folder's index.ts, not individual files.
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/shared/*/*'], message: 'Import from the shared folder (e.g. ../shared/enums), not a file inside it.' }],
      }],
    },
  },
  {
    // The detector worker imports these, so they must stay free of React/Mantine.
    files: ['src/shared/{enums,types,utils}/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'],
        patterns: [{ group: ['**/components', '**/theme'], message: 'enums/types/utils must not depend on UI code.' }],
      }],
    },
  },
);
