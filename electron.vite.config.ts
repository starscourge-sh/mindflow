import { cpSync, existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Excalidraw loads its hand-drawn fonts at runtime and falls back to a CDN
// when it cannot find them locally, which an offline app has no business
// reaching for. They are copied into the renderer's public folder, so they sit
// next to `index.html` both under the dev server and in the packaged app.
// Xiaolai is left behind: 12 MB of CJK glyphs against 480 KB for the rest.
const FONTS_FROM = resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const FONTS_TO = resolve('src/renderer/public/fonts')

if (existsSync(FONTS_FROM) && !existsSync(FONTS_TO)) {
  cpSync(FONTS_FROM, FONTS_TO, {
    recursive: true,
    filter: (source) => !source.includes('Xiaolai')
  })
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
