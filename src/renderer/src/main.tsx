import './assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import './lib/fade-fits'
// Every picture cut to a shape centred on its face or subject (Vision).
import './lib/picture-focus'
import './lib/freeze-notes'

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
//
// Opened from a file (the built app), the page asks for them through the app's own address instead
// (haligtree://app/fonts/…, answered in main from that same folder): Excalidraw reads a font with fetch to put it
// inside a drawing's picture, a page from a file may not fetch a file, and it went on to its CDN, which the app's
// policy refuses and logs. Under the dev server the page's own folder is fetched as it is.
window.EXCALIDRAW_ASSET_PATH = window.location.protocol === 'file:' ? 'haligtree://app/' : new URL('./', window.location.href).href

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

import * as React from 'react'
import { Component, StrictMode, type ReactNode } from 'react'
import { applyTheme, currentTheme } from './lib/theme'
import { TitleTips } from './components/ui/title-tips'
import { PdfPeek } from './components/pdf/pdf-peek'
import { LookUpHost } from './components/pdf/look-up'
import { Talk } from './components/haligtree/talk'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { stillTransforms } from './lib/motion'
import { TooltipProvider } from './components/ui/tooltip'
import { putDetailsAway } from './lib/reading'
import { guardFrost } from './lib/frost-guard'
import { markFloats } from './lib/menu-showing'
import { installTextUndo } from './lib/text-undo'
import { APP_NAME } from '../../main/name'
import { toasters, whyFailed } from './components/haligtree/ui'
import { chime } from './lib/sound'
import { wearSavedFonts } from './lib/editor-setup'
import { setHost } from './lib/host'

// `npm run dev` only (React's development build; the built app has none of this). For its own warnings to name the
// component that made an element, that build records where each element was made, an Error and a console task
// apiece, for the first 10,000 elements after any second in which it drew nothing. A page change makes more than
// that, so every press paid for all 10,000: about 70ms of a press that takes 110 without it (qa/press-answers.mjs
// says how many each press recorded). React keeps a count of them and stops recording once it passes 10,000: read
// here as always past it, nothing is recorded. To chase a React warning with its owner stack, run
// `localStorage['haligtree:owner-stacks'] = 'on'` in the console and reload.
{
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: object }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  if (internals && 'recentlyCreatedOwnerStacks' in internals && localStorage.getItem('haligtree:owner-stacks') !== 'on') Object.defineProperty(internals, 'recentlyCreatedOwnerStacks', { configurable: true, get: () => 1e9, set: () => undefined })
}

// The app as the page's host before anything renders, not first when an editor draws (haligtree-editor.tsx): a
// reader restored as the front tab after a restart asked the browser's host, which has no `fetchArticle`, and sat on
// "Reading the page…" for good with nothing asked of main (20 Nov 2026). A PDF from the web (`fetchPdf`) the same.
setHost(window.api)
// Before the first paint, and before anything renders: the page wears a theme
// whether or not an editor is on screen.
applyTheme(currentTheme())
// Chosen in another window, the prompt or the main one: wear it here too, at
// once, so the two never disagree.
// An imported theme added or taken away there is painted here as well.
window.addEventListener('storage', (event) => (event.key === 'theme' || event.key === 'custom-themes' || event.key === 'style') && applyTheme(currentTheme(), false))
// A save that failed in a window with no notices of its own (the pill, a goal's
// card, the meeting card): said on the nudge card with its sound, never lost.
window.addEventListener('unhandledrejection', (event) => {
  if (toasters || !String(event.reason?.message ?? event.reason ?? '').includes('Error invoking remote method')) return
  // The card's lead already says "Not saved": its words say why, and what to do.
  const why = whyFailed(event.reason)
  const text = `${why.charAt(0).toUpperCase()}${why.slice(1)}.`
  chime('nope')
  window.api.nudge({ kind: 'failed', id: text, text })
})
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
// Those same solid windows are where menus and pop-ups are frosted: each one kept opaque where frost cannot draw.
if (document.documentElement.dataset.dim === 'veil') guardFrost()
// What floats over the page, and a card holding the keys, marked on it for the styles that give way (main.css).
markFloats()
document.addEventListener('focusout', () => document.documentElement.removeAttribute('data-card-focus'))
document.addEventListener('focusin', ({ target }) => void document.documentElement.toggleAttribute('data-card-focus', target instanceof Element && target.matches('[data-card]')))
// ⌘Z and ⇧⌘Z in every plain text box, a whole run of typing at a time (lib/text-undo.ts).
installTextUndo()
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
// The fonts last chosen, worn before the first paint (lib/editor-setup.ts).
wearSavedFonts()

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
            {/* Every element's title as the app's own tip, never the system's grey box. */}
            <TitleTips />
            {/* A PDF named anywhere previews its pages on hover, scrubbed with the pointer. */}
            <PdfPeek />
            {/* The one Look Up card for notes and Review (a reader shows its own in its pages). */}
            <LookUpHost />
            {/* Talk to type: hold the talk key in any text field (talk.tsx). */}
            <Talk />
          </TooltipProvider>
        </Broken>
      </MotionConfig>
    </StrictMode>
  )
}

/** What the window's address says about it: the one thing a fresh page knows about itself. */
export { params }
