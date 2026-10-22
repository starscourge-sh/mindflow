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
