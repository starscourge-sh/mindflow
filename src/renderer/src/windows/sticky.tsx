// A sticky on the desktop: sticky.html. The goals and today stickies are stickies too.
import '../assets/main.css'
// Faded edges off once a list is all in view (lib/fade-fits.ts).
import '../lib/fade-fits'
import { StickyNote } from '../components/haligtree/sticky-note'
import { GoalSticky, GoalsSticky } from '../components/haligtree/goal-beacon'
import { TodaySticky } from '../components/haligtree/today-sticky'
import { Toaster } from '../components/haligtree/ui'
import { TuckTab } from '../components/haligtree/tuck-tab'
import { params, start } from '../main'
import { clearRoom } from '../lib/clear-room'
import { followGlass } from '../lib/glass'

const type = params.get('type')
// Its quiet ink is set for the sticky's paper (sticky-note.scss).
document.documentElement.dataset.stickyWindow = ''

start(
  <>
    {type === 'goal' ? <GoalSticky id={params.get('id') ?? ''} /> : type === 'goals' ? <GoalsSticky /> : type === 'today' ? <TodaySticky /> : <StickyNote type={type ?? 'capture'} id={params.get('id') ?? ''} />}
    {/* Every sticky tucked away: this window is a tab at the screen's edge, its name down it (main's shapeCard). */}
    <TuckTab />
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

// Made as glass (the setting): the Mac's blur under the card, or under the flat tab while it is tucked, and nowhere
// else in the window (lib/glass.ts). A named tab is solid paper and stands on none.
if (params.has('glass')) followGlass(() => [...document.querySelectorAll('.mf-card, [data-goal-card], [data-goals-sticky], [data-tuck-tab="flat"] > div')])

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
