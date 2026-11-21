// A sticky on the desktop: sticky.html. The goals and today stickies are stickies too.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { StickyNote } from '../components/haligtree/sticky-note'
import { GoalSticky, GoalsSticky } from '../components/haligtree/goal-beacon'
import { TodaySticky } from '../components/haligtree/today-sticky'
import { Toaster } from '../components/haligtree/ui'
import { DeskPill } from '../components/haligtree/desk-pill'
import { params, start } from '../main'
import { clearRoom } from '../lib/clear-room'
import { carryOnPress } from '../lib/carry'
import { watchCardPointer } from '../lib/card-pointer'
import { followGlass } from '../lib/glass'

const type = params.get('type')
// Its quiet ink is set for the sticky's paper (sticky-note.scss).
document.documentElement.dataset.stickyWindow = ''
// Picked up by a press where the card says so (DRAG in sticky-note.tsx): carried by main until the button comes up.
carryOnPress()
// The pointer coming onto the window and leaving it, told to main as it happens: a risen card set down, an opened tab folded.
watchCardPointer()

start(
  <>
    {type === 'goal' ? <GoalSticky id={params.get('id') ?? ''} /> : type === 'goals' ? <GoalsSticky /> : type === 'today' ? <TodaySticky /> : <StickyNote type={type ?? 'capture'} id={params.get('id') ?? ''} />}
    {/* Folded: this window is the card's pill in the desk's stack, its card hidden under it (main's shapeCard). */}
    <DeskPill />
    {/* A sticky says what the menu bar or ⌃⌥⌘T did when no other Haligtree window is out to say it. */}
    <Toaster />
  </>
)

// ⌘K, ⌘P and ⌘/ from a sticky open in the main window, as they do from quick capture: a sticky is too small to hold
// them, and before they did nothing at all here (qa/every-overlay.mjs). What the sticky's own writing took (⌘K on a
// link) is left to it.
window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key !== 'k' && key !== 'p' && key !== '/') return
  event.preventDefault()
  if (key === '/') window.api.openInHome('shortcuts', '')
  else window.api.openInHome('search', key === 'k' ? 'all' : 'notes')
})

// Made as glass (the setting): the Mac's blur under the card, and nowhere else in the window (lib/glass.ts). Folded,
// the blur is under its pill alone, which is opaque over it (main.css, [data-desk-pill]). A card grown out of its
// pill stays solid until it is pinned, with no blur anywhere (the pill is hidden while its card is out, so it is not
// told): the card grows by a clip, and the Mac's blur follows a shape's whole box, so it would show beyond the clip.
if (params.has('glass')) followGlass(() => {
  const pill = document.querySelector('[data-desk-pill]')
  return pill ? [pill] : [...document.querySelectorAll('.mf-card, [data-goal-card], [data-goals-sticky]')]
})

// The room round a paper card lets clicks through to the app behind; the card, and anything hanging past it, takes them.
clearRoom()

// Ready once its words are in: the page has drawn and stopped changing for a moment (its reads answered, its
// dots and numbers set), with its fonts loaded. Before, a card came onto the desktop blank and filled in after.
void document.fonts.ready.then(() => {
  let quiet = 0
  const said = (): void => (watch.disconnect(), clearTimeout(quiet), clearTimeout(cap), window.api.stickyReady())
  const settle = (): void => (clearTimeout(quiet), void (quiet = window.setTimeout(said, 220)))
  const watch = new MutationObserver(settle)
  watch.observe(document.body, { childList: true, subtree: true, characterData: true })
  const cap = window.setTimeout(said, 2500)
  settle()
})
