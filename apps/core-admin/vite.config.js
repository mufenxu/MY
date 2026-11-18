import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { env } from 'node:process'

const buildVersion = env.VITE_APP_VERSION || new Date().toISOString().replace(/[-:.TZ]/g, '')
const buildTime = new Date().toISOString()

const buildVersionPlugin = () => ({
  name: 'admin-build-version',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: buildVersion, builtAt: buildTime }, null, 2)
    })
  }
})

// React 运行时与路由很少变动，单独成包后业务代码发版不会让它的缓存失效。
// 必须按模块路径归组：对象写法只收包的入口模块，运行时主体会落回入口文件。
const reactVendorPackages = ['react', 'react-dom', 'scheduler', 'react-router']

function manualChunks(id) {
  const normalizedId = id.replace(/\\/g, '/')
  if (reactVendorPackages.some((name) => normalizedId.includes(`/node_modules/${name}/`))) return 'react-vendor'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion)
  },
  plugins: [react(), buildVersionPlugin()],
  build: {
    cssCodeSplit: true,
    manifest: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3045',
        changeOrigin: true,
      }
    }
  }
})
