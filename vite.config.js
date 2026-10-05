import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { nodeChatHandler } from './server/chatHandler.js'

// Serves POST /api/chat during `npm run dev` / `npm run preview` with the same handler Vercel uses (api/chat.js).
// loadEnv(..., '') also loads non-VITE_ vars (OPENAI_*) — they stay on the server and never reach the browser bundle.
function chatApi(env) {
  // block body on purpose: a function returned from configureServer is treated by Vite as a post-hook
  const mount = (server) => {
    server.middlewares.use('/api/chat', (req, res) => {
      nodeChatHandler(req, res, { ...env, ...process.env })
    })
  }
  return { name: 'rca-chat-api', configureServer: mount, configurePreviewServer: mount }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), chatApi(env)],
    build: {
      // react + react-router + supabase-js ≈ 560 kB minified (160 kB gzip) — fine for an internal tool
      chunkSizeWarningLimit: 700,
    },
  }
})
