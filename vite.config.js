import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // react + react-router + supabase-js ≈ 560 kB minified (160 kB gzip) — fine for an internal tool
    chunkSizeWarningLimit: 700,
  },
})
