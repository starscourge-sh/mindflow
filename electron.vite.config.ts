import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // Tiptap's vendored template files read Next.js-style `process.env`, which
    // does not exist in the Vite renderer. Inline them at build time instead.
    define: {
      'process.env.TIPTAP_COLLAB_DOC_PREFIX': JSON.stringify(process.env.TIPTAP_COLLAB_DOC_PREFIX ?? ''),
      'process.env.TIPTAP_COLLAB_APP_ID': JSON.stringify(process.env.TIPTAP_COLLAB_APP_ID ?? ''),
      'process.env.TIPTAP_COLLAB_TOKEN': JSON.stringify(process.env.TIPTAP_COLLAB_TOKEN ?? ''),
      'process.env.TIPTAP_AI_APP_ID': JSON.stringify(process.env.TIPTAP_AI_APP_ID ?? ''),
      'process.env.TIPTAP_AI_TOKEN': JSON.stringify(process.env.TIPTAP_AI_TOKEN ?? ''),
      'process.env.USE_JWT_TOKEN_API_ENDPOINT': JSON.stringify(process.env.USE_JWT_TOKEN_API_ENDPOINT ?? '')
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      exclude: ['@tldraw/assets']
    },
    plugins: [react(), tailwindcss()]
  }
})
