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

import { Component, StrictMode, type ReactNode } from 'react'
import { applyTheme, currentTheme } from './lib/theme'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { stillTransforms } from './lib/motion'
import { TooltipProvider } from './components/ui/tooltip'
import { putDetailsAway } from './lib/reading'
import { APP_NAME } from '../../main/name'

// Before the first paint, and before anything renders: the page wears a theme
// whether or not an editor is on screen.
applyTheme(currentTheme())
// Chosen in another window, the prompt or the main one: wear it here too, at
// once, so the two never disagree.
// An imported theme added or taken away there is painted here as well.
window.addEventListener('storage', (event) => (event.key === 'theme' || event.key === 'custom-themes' || event.key === 'style') && applyTheme(currentTheme(), false))
// A window you are not in steps back a little, so the one you are in is clear.
const blurred = (on: boolean) => (): void => void (document.documentElement.dataset.blurred = on ? 'on' : 'off')
// Checked a moment later: focus moving into an embed (a video in a note)
// blurs the page but not the window, and that should not dim it.
window.addEventListener('blur', () => setTimeout(() => blurred(!document.hasFocus())(), 0))
window.addEventListener('focus', blurred(false))
// The main window and a drawing's (solid windows) dim under a veil of their own background colour
// rather than by fading themselves: faded, the dark window behind showed through every pill, menu
// and toast, and they read as see-through. The box, stickies and a note's window float on
// see-through windows, where a veil would paint the corners: they keep the fade.
const opened = new URLSearchParams(window.location.search)
if (opened.get('view') === 'home' || opened.has('drawing')) document.documentElement.dataset.dim = 'veil'
// A window never scrolls as a whole: each page scrolls inside itself. Something
// reaching past the edge, brought into view by focus, would otherwise slide the
// sidebar and title bar off the window; no CSS stops a scroll asked for that way.
window.addEventListener('scroll', () => (window.scrollX || window.scrollY) && window.scrollTo(0, 0))

// A window opened on one drawing says so in its own URL, which is the only
// thing a fresh renderer knows about itself before any of this has run.
const params = new URLSearchParams(window.location.search)
const drawing = params.get('drawing')
// The page's own name, not the framework's: the window bar shows it.
document.title = drawing ? 'Drawing' : params.has('sandbox') ? `${APP_NAME} sandbox` : APP_NAME
// The word count, shown or not: one choice for every window, kept in step.
const wordCount = (): void => {
  if (localStorage.getItem('word-count') === 'off') document.documentElement.dataset.wordCount = 'off'
  else delete document.documentElement.dataset.wordCount
}
wordCount()
window.addEventListener('storage', wordCount)

/**
 * A window whose page broke while drawing says so and offers the way back,
 * instead of going blank with no clue. Notes are saved as they are typed (the
 * box's draft too), so reloading loses nothing.
 */
class Broken extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children
    // The glow covers the whole screen and takes no clicks: nothing, rather
    // than a panel stuck over every app that cannot be pressed.
    if (params.get('view') === 'glow') return null
    return (
      <div role="alert" className="m-3 flex flex-col items-start gap-2 rounded-xl border bg-background p-4 text-sm text-foreground shadow-(--mf-panel-shadow)">
        <p className="font-medium">This window ran into a problem and stopped.</p>
        <p className="text-muted-foreground">Your notes are saved. Reload the window to carry on; if it happens again, restart {APP_NAME}.</p>
        <p className="line-clamp-2 font-mono text-xs text-muted-foreground wrap-anywhere">{this.state.error.message}</p>
        <button type="button" autoFocus onClick={() => location.reload()} className="mt-1 rounded-md border bg-accent/60 px-3 py-1 font-medium hover:bg-accent">
          Reload window
        </button>
      </div>
    )
  }
}

// Reduce motion reaches a whole `transform: '...'` too, not only x, y and scale.
stillTransforms()

// Each time Haligtree opens, a note's details start put away.
if (params.get('view') === 'home') putDetailsAway()

/**
 * Draw this window's page. Each kind of window has a page of its own (an HTML
 * file and an entry in ./windows each, picked by the main process from the
 * window's address), so the box never loads the main window's views and a
 * sticky never loads a drawing. Everything in this file is what they share.
 */
export function start(page: ReactNode): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* What a Motion animation moves on unless it says otherwise: the app's curve (--mf-ease), at a UI pace. */}
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
        <Broken>
          {/* Every window can show a tip: one with none of its own (a sticky, the pill) took a priority mark's tip down with it. */}
          <TooltipProvider delayDuration={600} skipDelayDuration={400}>
            {page}
          </TooltipProvider>
        </Broken>
      </MotionConfig>
    </StrictMode>
  )
}

/** What the window's address says about it: the one thing a fresh page knows about itself. */
export { params }
