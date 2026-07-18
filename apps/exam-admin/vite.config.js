import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
    base: './',
    // Frontend assets are owned by this app and copied into the API image at build time.
    publicDir: path.resolve(__dirname, 'public'),
    plugins: [
        vue(),
        AutoImport({
            resolvers: [ElementPlusResolver()],
            imports: ['vue', 'vue-router'],
            dts: 'src/auto-imports.d.ts',
        }),
        Components({
            resolvers: [ElementPlusResolver()],
            dts: 'src/components.d.ts',
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3110',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: path.resolve(__dirname, 'dist'),
        emptyOutDir: true,
        manifest: true,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.replace(/\\/g, '/');
                    if (normalizedId.includes('node_modules/@vue') || normalizedId.includes('node_modules/vue-router')) return 'vue-vendor';
                    if (normalizedId.includes('node_modules/exceljs')) return 'exceljs';
                    if (normalizedId.includes('node_modules/papaparse')) return 'papaparse';
                    if (normalizedId.includes('node_modules/qrcode')) return 'qrcode';
                },
            },
        },
    },
});
