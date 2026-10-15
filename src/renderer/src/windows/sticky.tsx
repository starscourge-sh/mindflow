// A sticky on the desktop: sticky.html. The goals and today stickies are stickies too.
import '../assets/main.css'
import 'slot-text/style.css'
import { StickyNote } from '../components/vigil/sticky-note'
import { GoalStack } from '../components/vigil/goal-beacon'
import { TodaySticky } from '../components/vigil/today-sticky'
import { Toaster } from '../components/vigil/ui'
import { params, start } from '../main'

const type = params.get('type')

start(
  <>
    {type === 'goal' ? <GoalStack /> : type === 'today' ? <TodaySticky /> : <StickyNote type={type ?? 'capture'} id={params.get('id') ?? ''} />}
    {/* A sticky says what the menu bar or ⌃⌥⌘T did when no other Vigil window is out to say it. */}
    <Toaster />
  </>
)
