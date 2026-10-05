import './assets/main.css'
// Rolling text (counts, labels): the cell clipping it needs, once for every window.
import 'slot-text/style.css'

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
import { Home } from './home'
import { NoteWindow } from './components/vigil/note-window'
import { FocusPill, ScreenGlow } from './components/vigil/focus-pill'
import { StickyNote } from './components/vigil/sticky-note'

// Before the first paint, and before anything renders: the page wears a theme
// whether or not an editor is on screen.
applyTheme(currentTheme())
// Chosen in another window, the prompt or the main one: wear it here too, at
// once, so the two never disagree.
// An imported theme added or taken away there is painted here as well.
window.addEventListener('storage', (event) => (event.key === 'theme' || event.key === 'custom-themes' || event.key === 'frosted') && applyTheme(currentTheme()))
// A window you are not in steps back a little, so the one you are in is clear.
const blurred = (on: boolean) => (): void => void (document.documentElement.dataset.blurred = on ? 'on' : 'off')
// Checked a moment later: focus moving into an embed (a video in a note)
// blurs the page but not the window, and that should not dim it.
window.addEventListener('blur', () => setTimeout(() => blurred(!document.hasFocus())(), 0))
window.addEventListener('focus', blurred(false))

// A window opened on one drawing says so in its own URL, which is the only
// thing a fresh renderer knows about itself before any of this has run.
const params = new URLSearchParams(window.location.search)
const drawing = params.get('drawing')
// The page's own name, not the framework's: the window bar shows it.
document.title = drawing ? 'Drawing' : 'Vigil'
// The word count, shown or not: one choice for every window, kept in step.
const wordCount = (): void => {
  if (localStorage.getItem('word-count') === 'off') document.documentElement.dataset.wordCount = 'off'
  else delete document.documentElement.dataset.wordCount
}
wordCount()
window.addEventListener('storage', wordCount)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {drawing ? <DrawingWindow id={drawing} /> : params.get('note') ? <NoteWindow link={params.get('note')!} /> : params.get('view') === 'home' ? <Home /> : params.get('view') === 'focus' ? <FocusPill /> : params.get('view') === 'glow' ? <ScreenGlow /> : params.get('view') === 'sticky' ? <StickyNote type={params.get('type') ?? 'capture'} id={params.get('id') ?? ''} /> : <App />}
  </StrictMode>
)
