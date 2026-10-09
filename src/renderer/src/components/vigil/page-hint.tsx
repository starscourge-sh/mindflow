import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Lightbulb, X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { EASE, shift, useFirstVisit } from '@/lib/motion'
import { onboarding, playWelcome, useOnboarding } from '@/lib/onboarding'
import { enterSandbox } from '@/lib/sandbox'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { Typed, toast } from './ui'

/**
 * One quiet line the first time you reach a page, set in under the window's
 * title rather than floating over it: what the page is for, in a sentence.
 * Got it puts it away for good; Settings › Help can bring them all back.
 * Not while the welcome is up, and not in safe mode.
 *
 * Someone who used Vigil before the welcome existed sees, once, in the same
 * place, that there is a welcome and a sandbox to try.
 */
const HINTS: Record<string, string> = {
  inbox: 'Everything you catch waits here. Once a day, Tidy; once a week, Decide: P keeps it, R finishes it, D lets it go.',
  review: 'Cards come back just before you would forget them. Space turns one over; 1 to 4 says how well you knew it.',
  day: 'A page a day. Write a line, and what you caught, finished and reviewed today gathers underneath.',
  weekpage: 'One page a week: what matters this week, and how it went.',
  today: "Type a task the way you would say it, like 'call Mum friday 6pm'. Vigil reads the when.",
  questions: 'Questions you are not ready to answer. Add clues as they turn up; nothing needs settling.',
  goals: 'A day you are aiming for, and the road of days to it. Log what you did; the beacon keeps it in sight.',
  nuggets: 'What you kept, in your own words. These are what come back as hints and cards.',
  tags: 'Every #tag has a page. Give it a colour, or a date to be ready by.',
  home: 'What is coming back to you today, and shelves of what you kept.',
  matrix: "Your tasks sorted by urgent and important. Drag one to another square and it takes that square's importance.",
  routines: "What you do again and again. Write 'every!' in place of 'every' and the next one counts from when you last did it.",
  later: "For what has no day yet. Say 'this month', 'this year' or 'someday' when you type it, and it waits here.",
  upcoming: 'Every task with a day, day by day. T, M or W on a row moves it to today, tomorrow or next week.',
  stats: 'How you have been using Vigil, told in sentences. Your month and Your year play the whole stretch back, a page at a time.',
  map: 'Every note you linked, as dots joined by lines. Type [[ in any note to link it to another.',
  monthpage: 'One page a month: what it was for, and how it went. The year page lines the months up as seasons.',
  articles: "Your own words on one idea. In Ideas, press X on a few and 'Start an article' puts them on one page to write from."
}

export function PageHint({ page }: { page: string }): React.JSX.Element | null {
  const state = useOnboarding()
  const settings = useLive(vigil.settings, null as Settings | null)
  // Put away here at once, before the main process has said so.
  const [gone, setGone] = useState<string[]>([])
  const busy = (): boolean => document.documentElement.hasAttribute('data-welcoming') || document.documentElement.hasAttribute('data-touring')
  const [welcomeUp, setWelcomeUp] = useState(busy)
  useEffect(() => {
    const watch = new MutationObserver(() => setWelcomeUp(busy()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-welcoming', 'data-touring'] })
    return () => watch.disconnect()
  }, [])
  if (!state || !settings || welcomeUp || settings.safeMode) return null

  // Here before the welcome: told about it once.
  if (state.news && !gone.includes('news')) {
    const done = (): void => {
      setGone((was) => [...was, 'news'])
      void onboarding.set({ newsSeen: true })
    }
    return (
      <Line name="news" onDone={done} done="Not now">
        <span className="font-medium text-foreground">New:</span> a welcome tour, and a sandbox full of examples to try apart from your notes.{' '}
        <button type="button" onClick={() => (done(), playWelcome())} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Play the welcome</button>
        {' or '}
        <button type="button" onClick={() => {
          done()
          chime('scene')
          toast('Opening the sandbox. Vigil restarts in a moment.', undefined, 'info')
          void enterSandbox().catch(() => toast('The sandbox could not open just now.', undefined, 'warning'))
        }} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">open the sandbox</button>.
      </Line>
    )
  }

  const text = HINTS[page]
  // Home has Getting started under it while that is there: one guide at a time.
  if (page === 'home' && !state.sandbox && !state.hidden && !state.doneAt) return null
  // The sandbox is never welcomed (it has its own way in), but its pages say what they are for too.
  if (!text || !(state.welcomed || state.sandbox) || !state.pageHints || state.hintsSeen.includes(page) || gone.includes(page)) return null
  const done = (): void => {
    chime('tap')
    setGone((was) => [...was, page])
    void onboarding.set({ hintsSeen: [...state.hintsSeen, page] })
  }
  return <Line key={page} name={page} onDone={done} done="Got it"><Typed text={text} step={22} delay={250} /></Line>
}

function Line({ name, children, onDone, done }: { name: string; children: React.ReactNode; onDone: () => void; done: string }): React.JSX.Element {
  // A beat after the page, every time: there with the first paint it read as
  // part of the furniture, and was skipped. Its room is kept from the start, so
  // nothing moves when it comes; with Motion off it is simply there.
  const first = useFirstVisit(`hint:${name}`)
  const [enter] = useState(() => document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  return (
    <motion.div role="note"
      initial={enter ? { opacity: 0, transform: shift(first ? 'translateY(-4px)' : 'translateY(0px)') } : false}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      transition={{ duration: 0.3, delay: 0.6, ease: EASE }}
      className="flex shrink-0 items-start gap-3 rounded-xl border border-foreground/[0.07] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] py-2 pr-1.5 pl-3.5 text-control leading-relaxed text-muted-foreground">
      <Lightbulb aria-hidden className="mt-[0.2rem] size-3.5 shrink-0 text-primary" strokeWidth={2} />
      <p className="min-w-0 flex-1 py-px text-pretty">{children}</p>
      <button type="button" onClick={onDone} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.07] hover:text-foreground">
        {done}
        <X aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
    </motion.div>
  )
}
