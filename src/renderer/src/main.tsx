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
import App from './App'
import { DrawingWindow } from './components/excalidraw/drawing-window'
import { Home } from './home'
import { NoteWindow } from './components/vigil/note-window'
import { FocusPill, ScreenGlow } from './components/vigil/focus-pill'
import { StickyNote } from './components/vigil/sticky-note'
import { Toaster } from './components/vigil/ui'
import { LookWindow } from './components/vigil/look-window'
import { GoalStack } from './components/vigil/goal-beacon'
import { TodaySticky } from './components/vigil/today-sticky'
import { putDetailsAway } from './lib/reading'

// Before the first paint, and before anything renders: the page wears a theme
// whether or not an editor is on screen.
applyTheme(currentTheme())
// Chosen in another window, the prompt or the main one: wear it here too, at
// once, so the two never disagree.
// An imported theme added or taken away there is painted here as well.
window.addEventListener('storage', (event) => (event.key === 'theme' || event.key === 'custom-themes' || event.key === 'frosted' || event.key === 'style') && applyTheme(currentTheme(), false))
// A window you are not in steps back a little, so the one you are in is clear.
const blurred = (on: boolean) => (): void => void (document.documentElement.dataset.blurred = on ? 'on' : 'off')
// Checked a moment later: focus moving into an embed (a video in a note)
// blurs the page but not the window, and that should not dim it.
window.addEventListener('blur', () => setTimeout(() => blurred(!document.hasFocus())(), 0))
window.addEventListener('focus', blurred(false))
// A window never scrolls as a whole: each page scrolls inside itself. Something
// reaching past the edge, brought into view by focus, would otherwise slide the
// sidebar and title bar off the window; no CSS stops a scroll asked for that way.
window.addEventListener('scroll', () => (window.scrollX || window.scrollY) && window.scrollTo(0, 0))

// A window opened on one drawing says so in its own URL, which is the only
// thing a fresh renderer knows about itself before any of this has run.
const params = new URLSearchParams(window.location.search)
const drawing = params.get('drawing')
// The page's own name, not the framework's: the window bar shows it.
document.title = drawing ? 'Drawing' : params.has('sandbox') ? 'Vigil sandbox' : 'Vigil'
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
        <p className="text-muted-foreground">Your notes are saved. Reload the window to carry on; if it happens again, restart Vigil.</p>
        <p className="line-clamp-2 font-mono text-xs text-muted-foreground wrap-anywhere">{this.state.error.message}</p>
        <button type="button" autoFocus onClick={() => location.reload()} className="mt-1 rounded-md border bg-accent/60 px-3 py-1 font-medium hover:bg-accent">
          Reload window
        </button>
      </div>
    )
  }
}

// Each time Vigil opens, a note's details start put away.
if (params.get('view') === 'home') putDetailsAway()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* What a Motion animation moves on unless it says otherwise: the app's curve (--mf-ease), at a UI pace. */}
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
    <Broken>
    {drawing ? <DrawingWindow id={drawing} /> : params.get('note') ? <NoteWindow link={params.get('note')!} /> : params.get('view') === 'home' ? <Home /> : params.get('view') === 'focus' ? <FocusPill /> : params.get('view') === 'glow' ? <ScreenGlow /> : params.get('view') === 'look' ? <LookWindow /> : params.get('view') === 'sticky' && params.get('type') === 'goal' ? <GoalStack /> : params.get('view') === 'sticky' && params.get('type') === 'today' ? <TodaySticky /> : params.get('view') === 'sticky' ? <StickyNote type={params.get('type') ?? 'capture'} id={params.get('id') ?? ''} /> : <App />}
    {/* A sticky says what the menu bar or ⌃⌥⌘T did when no other Vigil window is out to say it. */}
    {params.get('view') === 'sticky' && <Toaster />}
    </Broken>
    </MotionConfig>
  </StrictMode>
)
