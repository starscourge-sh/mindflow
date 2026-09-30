import './assets/main.css'

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

// Excalidraw fetches its hand-drawn fonts at runtime and falls back to a CDN
// when it cannot find them. A CDN is a fine default for anything embedding the
// editor on the web; this app is offline, so it copies the fonts next to
// `index.html` at build time (see the vite config) and points Excalidraw at
// the page's own folder - which is the right shape in dev over http and in the
// packaged app over `file://` alike.
//
// Here rather than in the editor: where the fonts live is the host's business,
// the same way the page background and the web font are.
window.EXCALIDRAW_ASSET_PATH = new URL('./', window.location.href).href

// Excalidraw opens files through `browser-fs-access`, which uses the File
// System Access API where it finds one and a plain `<input type="file">` where
// it does not. Electron exposes `showOpenFilePicker` without the permission
// flow behind it, so the picker opened and closed again in the same breath -
// "import image" did nothing at all.
//
// Taking the name away is how that library is told to use the fallback: it
// feature-detects once, when it loads. Before the imports below, because the
// editor is fetched lazily and this has to be gone before it arrives.
//
// Nothing else here asks for it. If Electron ever implements the flow, delete
// this and the modern path comes back.
delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker

import { StrictMode } from 'react'
import { applyTheme, currentTheme } from './lib/theme'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DrawingWindow } from './components/excalidraw/drawing-window'

// Before the first paint, and before anything renders: the page wears a theme
// whether or not an editor is on screen.
applyTheme(currentTheme())

// A window opened on one drawing says so in its own URL, which is the only
// thing a fresh renderer knows about itself before any of this has run.
const drawing = new URLSearchParams(window.location.search).get('drawing')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{drawing ? <DrawingWindow id={drawing} /> : <App />}</StrictMode>
)
