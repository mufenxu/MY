import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

const browserGlobals = {
    AbortController: 'readonly',
    AbortSignal: 'readonly',
    Blob: 'readonly',
    CSS: 'readonly',
    CustomEvent: 'readonly',
    Event: 'readonly',
    FormData: 'readonly',
    Headers: 'readonly',
    HTMLElement: 'readonly',
    Image: 'readonly',
    IntersectionObserver: 'readonly',
    Node: 'readonly',
    ResizeObserver: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    atob: 'readonly',
    btoa: 'readonly',
    cancelAnimationFrame: 'readonly',
    clearInterval: 'readonly',
    clearTimeout: 'readonly',
    console: 'readonly',
    crypto: 'readonly',
    document: 'readonly',
    fetch: 'readonly',
    getComputedStyle: 'readonly',
    history: 'readonly',
    localStorage: 'readonly',
    location: 'readonly',
    matchMedia: 'readonly',
    navigator: 'readonly',
    performance: 'readonly',
    queueMicrotask: 'readonly',
    requestAnimationFrame: 'readonly',
    sessionStorage: 'readonly',
    setInterval: 'readonly',
    setTimeout: 'readonly',
    structuredClone: 'readonly',
    window: 'readonly',
};

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'src/auto-imports.d.ts', 'src/components.d.ts'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js', '**/*.mjs', '**/*.vue'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: browserGlobals,
        },
        rules: {
            'no-unused-vars': ['error', {
                args: 'after-used',
                caughtErrors: 'none',
                ignoreRestSiblings: true,
            }],
            'no-useless-escape': 'warn',
        },
    },
    ...pluginVue.configs['flat/essential'],
    {
        files: ['**/*.vue'],
        languageOptions: {
            parser: vueParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
    },
    {
        files: ['vite.config.js'],
        languageOptions: {
            globals: {
                __dirname: 'readonly',
                process: 'readonly',
            },
        },
    },
];
