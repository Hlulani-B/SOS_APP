import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // Native-only plugins that the web build should not try to resolve.
      // The runtime code checks Capacitor.isNativePlatform() before using them.
      external: ['@capacitor/local-notifications'],
    },
  },
  server: {
    proxy: {
      // The api-fetch wrappers call /api/<module> on their own origin; the
      // dev server forwards them to the Express backend on port 3000, so
      // the browser never hits CORS.
      '/api/users': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/pals': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/location': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
