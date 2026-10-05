// Vercel serverless function: POST /api/chat → RCA chatbot. Logic lives in server/chatHandler.js.
// Set OPENAI_API_KEY, OPENAI_MODEL, OPENAI_REASONING (+ the VITE_PRODUCTION_SUPABASE_* pair) in Vercel → Environment Variables.
import { nodeChatHandler } from '../server/chatHandler.js'

export const config = { maxDuration: 60 }

export default function handler(req, res) {
  return nodeChatHandler(req, res, process.env)
}
