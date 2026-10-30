import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dashboard is served from https://gripstylepos.netlify.app/whatsapp/
export default defineConfig({
  base: '/whatsapp/',
  plugins: [react()],
})