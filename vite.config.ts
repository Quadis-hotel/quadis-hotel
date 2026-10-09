import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SPA build. Reference photography is never shipped (§5); real photos drop into
// src/assets/photos/** and are resolved via import.meta.glob.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'esnext' }
})
