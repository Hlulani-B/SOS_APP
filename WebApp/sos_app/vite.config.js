import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
