// A sticky on the desktop: sticky.html. The goals and today stickies are stickies too.
import '../assets/main.css'
import 'slot-text/style.css'
import { StickyNote } from '../components/haligtree/sticky-note'
import { GoalSticky, GoalsSticky } from '../components/haligtree/goal-beacon'
import { TodaySticky } from '../components/haligtree/today-sticky'
import { Toaster } from '../components/haligtree/ui'
import { params, start } from '../main'

const type = params.get('type')

start(
  <>
    {type === 'goal' ? <GoalSticky id={params.get('id') ?? ''} /> : type === 'goals' ? <GoalsSticky /> : type === 'today' ? <TodaySticky /> : <StickyNote type={type ?? 'capture'} id={params.get('id') ?? ''} />}
    {/* A sticky says what the menu bar or ⌃⌥⌘T did when no other Haligtree window is out to say it. */}
    <Toaster />
  </>
)

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
