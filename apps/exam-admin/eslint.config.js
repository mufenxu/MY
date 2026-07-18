import vueParser from 'vue-eslint-parser';

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'src/auto-imports.d.ts', 'src/components.d.ts'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            'no-debugger': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
        },
    },
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        rules: {
            'no-debugger': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
        },
    },
];
