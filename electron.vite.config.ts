import { cpSync, existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
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

/**
 * Libraries that some editor extension imports but Vigil either never reaches
 * or needs only now and then, swapped for a stand-in when that extension asks
 * for them (src/renderer/src/lib/shims says why each one is safe). Under the
 * dev server, dependencies bundled ahead of time keep the real ones, which
 * works the same and only loads more.
 */
const SHIMS: { from: string; asks: string; use: string }[] = [
  // Drawn when a formula is first met, not with every window.
  { from: '@tiptap/extension-mathematics', asks: 'katex', use: 'katex.ts' },
  // Find and replace's regex mode, which Vigil never turns on.
  { from: '@tiptap/extension-find-and-replace', asks: 're2js', use: 're2js.ts' },
  // The drag handle's live collaboration, which Vigil's editors never have.
  { from: '@tiptap/extension-drag-handle', asks: '@tiptap/y-tiptap', use: 'no-collab.ts' },
  { from: '@tiptap/extension-drag-handle', asks: '@tiptap/extension-collaboration', use: 'no-collab.ts' }
]
/** The drawing editor's translations, all but English (which it holds itself) and its own table of how complete each is. */
const LOCALE = /^\.\/locales\/(?!en-|percentages-)[^/]+\.js$/
const shims = (): Plugin => ({
  name: 'vigil-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer?.includes('/node_modules/@excalidraw/excalidraw/') && LOCALE.test(source)) return resolve('src/renderer/src/lib/shims/no-locale.ts')
    const shim = importer && SHIMS.find((one) => one.asks === source && importer.includes(`/node_modules/${one.from}/`))
    return shim ? resolve('src/renderer/src/lib/shims', shim.use) : null
  }
})

// In the order the one page used to import them, which is the order their styles are joined in.
const PAGES = ['index', 'drawing', 'home', 'note', 'nudge', 'pill', 'sticky', 'look']

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
    plugins: [react(), tailwindcss(), shims()],
    // The built app's code is shrunk (spaces out, inner names short) so it
    // loads faster; the source is untouched and dev is not shrunk. A map file
    // is written beside each piece, not linked from it and left out of the
    // packaged app (electron-builder.yml), to read an error report back into
    // the real file and line.
    //
    // Each kind of window has a page of its own (src/main/pages.ts), so it
    // loads only its own code. The styles stay one file, read in the one
    // order they always were, so splitting the code never changes which
    // rule wins.
    build: {
      minify: 'esbuild',
      sourcemap: 'hidden',
      cssCodeSplit: false,
      rollupOptions: { input: Object.fromEntries(PAGES.map((page) => [page, resolve(`src/renderer/${page}.html`)])) }
    }
  }
})
