import { cpSync, existsSync, readFileSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { searchForWorkspaceRoot, type Plugin } from 'vite'
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

// pdf.js decodes a scan's pages (fax-style and JBIG2 black-and-white, JPEG 2000 colour) with small decoders it ships as
// WebAssembly, and draws the standard fonts and character maps a PDF leaves out from files of its own; it fetches all
// of them from where it is told (pdf-pages.tsx `loadPdf`). Told nowhere, a scanned book drew every page blank: "Unable
// to decode image … JBig2 failed to initialize" (the user, 14 Nov, "Beyond Good and Evil"). Copied beside index.html
// as the fonts above are, so they are there under the dev server and in the packaged app, never fetched from the web.
// Copied afresh at every start, so a newer pdf.js never meets an older decoder.
const PDFJS_FROM = resolve('node_modules/pdfjs-dist')
const PDFJS_TO = resolve('src/renderer/public/pdfjs')
for (const part of ['wasm', 'standard_fonts', 'cmaps', 'iccs']) cpSync(resolve(PDFJS_FROM, part), resolve(PDFJS_TO, part), { recursive: true })

/**
 * Libraries that some editor extension imports but Haligtree either never reaches
 * or needs only now and then, swapped for a stand-in when that extension asks
 * for them (src/renderer/src/lib/shims says why each one is safe). Under the
 * dev server, dependencies bundled ahead of time keep the real ones, which
 * works the same and only loads more.
 */
const SHIMS: { from: string; asks: string; use: string }[] = [
  // Drawn when a formula is first met, not with every window.
  { from: '@tiptap/extension-mathematics', asks: 'katex', use: 'katex.ts' },
  // Find and replace's regex mode, which Haligtree never turns on.
  { from: '@tiptap/extension-find-and-replace', asks: 're2js', use: 're2js.ts' },
  // The drag handle's live collaboration, which Haligtree's editors never have.
  { from: '@tiptap/extension-drag-handle', asks: '@tiptap/y-tiptap', use: 'no-collab.ts' },
  { from: '@tiptap/extension-drag-handle', asks: '@tiptap/extension-collaboration', use: 'no-collab.ts' }
]
/** The drawing editor's translations, all but English (which it holds itself) and its own table of how complete each is. */
const LOCALE = /^\.\/locales\/(?!en-|percentages-)[^/]+\.js$/
const shims = (): Plugin => ({
  name: 'haligtree-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer?.includes('/node_modules/@excalidraw/excalidraw/') && LOCALE.test(source)) return resolve('src/renderer/src/lib/shims/no-locale.ts')
    const shim = importer && SHIMS.find((one) => one.asks === source && importer.includes(`/node_modules/${one.from}/`))
    return shim ? resolve('src/renderer/src/lib/shims', shim.use) : null
  },
  // Excalidraw's last resort for a font it cannot find is a CDN (esm.sh). An offline app asks the web for nothing:
  // its last resort is the app's own folder again (haligtree://app/, main/index.ts), so a font left out of the
  // build (Xiaolai, above) is simply not found, and the Mac's own face draws those letters.
  transform(code, id) {
    if (!id.includes('/node_modules/@excalidraw/excalidraw/') || !code.includes('https://esm.sh/')) return null
    const local = code.replace(/`https:\/\/esm\.sh\/\$\{[^`]*`[^`]*`[^`]*\}\/dist\/prod\/`/, '"haligtree://app/"')
    if (local.includes('https://esm.sh/')) throw new Error('Excalidraw still names its font CDN: its code changed, look at ASSETS_FALLBACK_URL again')
    return { code: local, map: null }
  }
})

/**
 * Libraries main needs only now and then, loaded the first time they are
 * asked for (src/main/lazy says how) instead of as Haligtree opens: each one
 * required as main starts held it up before any window could be made. Only
 * main's own imports of them are swapped; the stand-ins import the real ones.
 */
const LAZY: Record<string, string> = {
  'chrono-node': 'chrono.ts',
  '@tiptap/extension-emoji': 'emoji.ts',
  linkedom: 'linkedom.ts',
  zod: 'zod.ts',
  entities: 'entities.ts',
  'image-size': 'image-size.ts',
  'image-size/fromFile': 'image-size.ts'
}
const lazy = (): Plugin => ({
  name: 'haligtree-lazy',
  enforce: 'pre',
  resolveId(source, importer) {
    return Object.hasOwn(LAZY, source) && importer?.includes('/src/main/') && !importer.includes('/src/main/lazy/') ? resolve('src/main/lazy', LAZY[source]) : null
  }
})

/** Each page's <title> says the app's name from src/main/name.ts, so a rename stays one line. */
const APP_NAME = /APP_NAME = '([^']+)'/.exec(readFileSync(resolve('src/main/name.ts'), 'utf8'))![1]
const named = (): Plugin => ({ name: 'haligtree-named', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%APP_NAME%', APP_NAME) } })

// In the order the one page used to import them.
const PAGES = ['index', 'drawing', 'home', 'note', 'nudge', 'meeting', 'pill', 'sticky', 'look', 'menu', 'scene']

export default defineConfig({
  // The lazy libraries are left to their stand-ins, each requiring its library itself when first asked
  // (src/main/lazy): a dependency named external is never shown to the plugin, and stayed required as main starts.
  main: { plugins: [lazy()], build: { externalizeDeps: { exclude: Object.keys(LAZY) } } },
  preload: {},
  renderer: {
    // Run from a git worktree whose node_modules is a link to the main checkout's, the fonts and other files a page
    // asks for out of node_modules (Fraunces, KaTeX's) were refused by the dev server, outside its allowed folders,
    // so headings and maths fell back to other fonts in `npm run dev` only. The folder the link leads to is allowed too.
    server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(resolve('node_modules'))] } },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), shims(), named()],
    // The built app's code is shrunk (spaces out, inner names short) so it
    // loads faster; the source is untouched and dev is not shrunk. A map file
    // is written beside each piece, not linked from it and left out of the
    // packaged app (electron-builder.yml), to read an error report back into
    // the real file and line.
    //
    // Each kind of window has a page of its own (src/main/pages.ts), so it
    // loads only its own code. The styles stay one file that every window
    // reads, so splitting the code cannot leave one window with a rule
    // another has, or change which rule wins between pieces loaded later.
    // Only the drawing editor's own styles come apart: it adds them itself
    // as it opens (excalidraw-canvas.tsx).
    build: {
      minify: 'esbuild',
      sourcemap: 'hidden',
      cssCodeSplit: false,
      rollupOptions: { input: Object.fromEntries(PAGES.map((page) => [page, resolve(`src/renderer/${page}.html`)])) }
    }
  }
})
