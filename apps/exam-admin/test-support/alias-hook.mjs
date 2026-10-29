import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Mirrors the `@` alias declared in vite.config.js, so tests can import modules
// that resolve their dependencies through `@/...`.
const SRC_ROOT = new URL('../src/', import.meta.url);
const EXTENSION_CANDIDATES = ['', '.js', '.mjs', '/index.js'];

export async function resolve(specifier, context, next) {
    if (!specifier.startsWith('@/')) {
        return next(specifier, context);
    }

    const base = new URL(specifier.slice(2), SRC_ROOT);
    for (const suffix of EXTENSION_CANDIDATES) {
        const candidate = new URL(`${base.href}${suffix}`);
        if (existsSync(fileURLToPath(candidate))) {
            return next(candidate.href, context);
        }
    }

    throw new Error(`Cannot resolve "${specifier}" against ${SRC_ROOT.href}`);
}
