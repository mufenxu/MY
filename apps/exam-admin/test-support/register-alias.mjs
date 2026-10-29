import { register } from 'node:module';

// Loaded via `node --import` from the test script. Kept outside `test/` because
// `node --test` treats every file under a `test` directory as a test file.
register('./alias-hook.mjs', import.meta.url);
