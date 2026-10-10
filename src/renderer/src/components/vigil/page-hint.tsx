import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Lightbulb, X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { EASE, shift, useFirstVisit } from '@/lib/motion'
import { onboarding, playWelcome, useOnboarding } from '@/lib/onboarding'
import { SANDBOX, enterSandbox } from '@/lib/sandbox'
import { useLive, vigil, type Settings } from '@/lib/vigil'
import { styleNudgeDue, styleNudged } from '@/lib/theme'
import { splitLead } from './lead'
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
  inbox: '**Everything you catch waits here.** Tidy it once a day; once a week, Decide.',
  review: '**Cards come back just before you would forget them.** Space turns one over; 1 to 4 says how well you knew it.',
  day: '**A page a day.** Write a line, and what you caught, finished and reviewed today gathers underneath.',
  weekpage: '**One page a week.** What matters this week, and how it went.',
  today: '**Type a task the way you would say it.** Vigil reads the when in ‘call Mum friday 6pm’.',
  questions: '**Questions you are not ready to answer.** Add clues as they turn up; nothing needs settling.',
  goals: '**A day you are aiming for, and the road of days to it.** Log what you did, and the beacon keeps it in sight.',
  nuggets: '**What you kept, in your own words.** These come back as hints, and as Review cards once you give them a question.',
  tags: '**Every #tag has a page.** Give it a colour, or a date to be ready by.',
  home: '**What is coming back to you today.** Under it, shelves of what you kept.',
  matrix: '**Your tasks by urgent and important.** Drag one to another square to change it.',
  routines: '**What you do again and again.** Write ‘every week’ as you type a task, and it comes round.',
  later: '**For what has no day yet.** Say ‘this month’, ‘this year’ or ‘someday’ as you type it, and it waits here.',
  upcoming: '**Every task after today, day by day, then the ones with no date.** T, M or W on a row moves it to today, tomorrow or next week.',
  stats: '**How you have been using Vigil, in sentences.** Your month and Your year play it back.',
  map: '**Every note you linked, as dots joined by lines.** Type @ in a note to link it.',
  monthpage: '**One page a month: what to aim for, and a name for it looking back.**',
  articles: "**Your own words on one idea.** In Ideas, select a few with X, then Start an article."
}

/** Said once a launch in the sandbox, in this line's place: shown, then gone on its own. */
let arrived = false
const ARRIVAL_MS = 9000

export function PageHint({ page }: { page: string }): React.JSX.Element | null {
  const state = useOnboarding()
  // Into the sandbox: where you are and that your notes are safe, docked
  // under the top bar rather than a toast over the page, then out of the way.
  const [arrival, setArrival] = useState(() => SANDBOX && !arrived)
  useEffect(() => {
    if (!arrival) return
    arrived = true
    const gone = setTimeout(() => setArrival(false), ARRIVAL_MS)
    return () => clearTimeout(gone)
  }, [arrival])
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
  if (arrival && !welcomeUp) {
    return (
      <Line name="sandbox-arrival" onDone={() => (chime('tap'), setArrival(false))} done="Got it">
        <strong>You’re in the sandbox, a practice copy. Your own notes are safe.</strong> Try anything here.
      </Line>
    )
  }
  if (!state || !settings || welcomeUp || settings.safeMode) return null

  // Here before the welcome: told about it once.
  if (state.news && !gone.includes('news')) {
    const done = (): void => {
      setGone((was) => [...was, 'news'])
      void onboarding.set({ newsSeen: true })
    }
    return (
      <Line name="news" onDone={done} done="Not now">
        <strong>New: a welcome tour, and a sandbox.</strong> The sandbox is full of examples to try, apart from your notes.{' '}
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

  // Three themes tried: once ever, that there is a louder style too.
  if (styleNudgeDue() && !gone.includes('style') && (state.welcomed || state.sandbox) && state.pageHints) {
    const done = (): void => {
      styleNudged()
      setGone((was) => [...was, 'style'])
    }
    return (
      <Line name="style" onDone={() => (chime('tap'), done())} done="Got it">
        <strong>There’s a louder style too.</strong>{' '}
        <button type="button" onClick={() => (done(), (() => { try { localStorage.setItem('settings:section', 'Appearance') } catch {} })(), window.api.openInHome('view', 'settings'))} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Settings, Appearance</button>.
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
  // The lead-in is there with the line, so it reads at a glance; the rest types in after it.
  const { lead, rest } = splitLead(text)
  return <Line key={page} name={page} onDone={done} done="Got it"><strong>{lead}</strong> <Typed text={rest} delay={0} within={220} /></Line>
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
      transition={{ duration: 0.2, ease: EASE }}
      className="flex shrink-0 items-start gap-3 rounded-xl border border-foreground/[0.07] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] py-2 pr-1.5 pl-3.5 text-control text-muted-foreground">
      <Lightbulb aria-hidden className="mt-[0.4rem] size-3.5 shrink-0 text-primary" strokeWidth={2} />
      <p className="mf-prose min-w-0 flex-1 py-px text-[0.9375rem]">{children}</p>
      <button type="button" onClick={onDone} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.07] hover:text-foreground">
        {done}
        <X aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
    </motion.div>
  )
}
