import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 按模块路径归组。对象写法只把包的入口模块放进 chunk，而 React 运行时实际在
// react-dom/client 与 scheduler 里，会整体落回入口文件，导致每次发版都要重新下载。
const vendorChunks = {
  'react-vendor': ['react', 'react-dom', 'scheduler'],
  'console-vendor': ['lucide-react', '@marsidev/react-turnstile', '@simplewebauthn/browser'],
};

function manualChunks(id) {
  const normalizedId = id.replace(/\\/g, '/');
  for (const [chunkName, packages] of Object.entries(vendorChunks)) {
    if (packages.some((name) => normalizedId.includes(`/node_modules/${name}/`))) return chunkName;
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
  build: {
    sourcemap: process.env.SOURCE_MAPS === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
