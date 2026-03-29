import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/web-ftp/',
  server: {
    proxy: {
      '/ftp.php': 'http://localhost:8000'
    }
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true
  }
})
