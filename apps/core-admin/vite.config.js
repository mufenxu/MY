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
    chunkSizeWarningLimit: 650
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3045',
        changeOrigin: true,
      }
    }
  }
})
