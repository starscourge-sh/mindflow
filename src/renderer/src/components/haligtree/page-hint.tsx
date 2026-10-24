import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Lightbulb, X } from 'lucide-react'
import { chime, onCue, type Cue } from '@/lib/sound'
import { EASE, shift, useFirstVisit } from '@/lib/motion'
import { onboarding, playWelcome, useOnboarding } from '@/lib/onboarding'
import { SANDBOX, enterSandbox } from '@/lib/sandbox'
import { useLive, haligtree, type Settings } from '@/lib/haligtree'
import { useAnyNoteOpen } from '@/lib/notes'
import { splitLead } from './lead'
import { Typed, toast } from './ui'
import { APP_NAME } from '../../../../main/name'

/**
 * One quiet line the first time you reach a page, set in under the window's
 * title rather than floating over it: what the page is for, in a sentence.
 * Got it puts it away for good; Settings › Help can bring them all back.
 * Not while the welcome is up, and not in safe mode.
 *
 * Someone who used Haligtree before the welcome existed sees, once, in the same
 * place, that there is a welcome and a sandbox to try.
 */
const HINTS: Record<string, string> = {
  inbox: '**Everything you catch waits here.** In “Go through…”, “Tidy” tags them once a day so you can find them again; once a week, “Decide” what to keep.',
  review: '**Cards come back as you start to forget them.** Space turns one over; 1 to 4 says how well you knew it.',
  day: '**A page a day, a week, a month and a year.** Write a line, and what you caught, finished and reviewed gathers underneath; Day, Week, Month and Year switch between them.',
  today: `**Type a task the way you would say it.** ${APP_NAME} reads the when in ‘call Mum friday 6pm’.`,
  questions: '**Your questions, as pages in Writing.** Add clues as they turn up; “Answered” turns them into writing, oldest first.',
  goals: '**A day you are aiming for, and the road of days to it.** Log what you did, and a small card on your screen keeps it in sight.',
  nuggets: '**Gems are the notes you chose to keep.** They come back as hints, and as Review cards once you give one a question.',
  queue: '**What you mean to read next, in order.** Add a note from its menu or drag it onto “Queue” in the sidebar; “Start reading” goes through them one after another.',
  tags: '**Every #tag has a page.** Give it a colour, or a date to be ready by.',
  home: '**What is coming back to you today.** Under it, shelves of what you kept.',
  matrix: '**Your tasks by urgent and important.** Drag one to another square to change it.',
  routines: '**What you do again and again.** Write ‘every week’ as you type a task, and it comes round.',
  later: '**For what has no day yet.** Say ‘this month’, ‘this year’ or ‘someday’ as you type it, and it waits here.',
  upcoming: '**Every task after today, day by day, then the ones with no date.** T, M or W on a row moves it to today, tomorrow or next week.',
  stats: `**How you have been using ${APP_NAME}, in sentences.** The few parts that matter most first; “Your month” and “Your year” hold the rest.`,
  map: '**Every note you linked, as dots joined by lines.** Type @ in a note to link it.',
  articles: "**Longer pieces in your own words, one idea each.** Start one with “New page”, or in Gems select a few with X, then “Start a page”."
}

/**
 * What doing a page's thing sounds like: the first time you do it with its
 * line still up, the line says "You've got it" for a moment and folds away,
 * put away for good as Got it would.
 */
const LEARNED: Record<string, Cue[]> = {
  inbox: ['promote', 'resolve', 'away', 'shelve', 'hold', 'tidied', 'sifted'],
  review: ['again', 'hard', 'good', 'easy'],
  today: ['noted', 'done'],
  upcoming: ['noted', 'done', 'later'],
  later: ['noted', 'done', 'later'],
  routines: ['noted', 'done'],
  matrix: ['noted', 'done', 'move'],
  questions: ['hold', 'clue', 'answered'],
  goals: ['logged', 'mark', 'goal'],
  tags: ['tag', 'retag'],
  articles: ['promote']
}
/** How long "You've got it" stays before the line folds away. */
const GOT_IT_MS = 1500

/**
 * Day, Week, Month and Year share one bar, so they share one line: up on all
 * four or none. A line on Day alone pushed the bar down there and nowhere
 * else, and switching made it jump.
 */
const SAME_LINE: Record<string, string> = { weekpage: 'day', monthpage: 'day', yearpage: 'day' }

/** Pages of notes: their line is not shown while one of their notes is open. */
const LISTS = ['inbox', 'nuggets', 'articles', 'questions', 'goals', 'tags']

/** Said once a launch in the sandbox, in this line's place: shown, then gone on its own. */
let arrived = false
const ARRIVAL_MS = 9000

export function PageHint({ page: shown }: { page: string }): React.JSX.Element | null {
  const page = SAME_LINE[shown] ?? shown
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
  const settings = useLive(haligtree.settings, null as Settings | null)
  const noteOpen = useAnyNoteOpen()
  // Put away here at once, before the main process has said so.
  const [gone, setGone] = useState<string[]>([])
  // The page's thing just done, with its line up: "You've got it", then away.
  const [got, setGot] = useState<string | null>(null)
  const showing = useRef<(() => void) | null>(null)
  useEffect(() => onCue((cue) => {
    if (!showing.current || !LEARNED[page]?.includes(cue)) return
    const put = showing.current
    showing.current = null
    setGot(page)
    setTimeout(put, GOT_IT_MS)
  }), [page])
  // Only the page's own line, while it is up, can be learned: set again below when it is.
  showing.current = null
  const busy = (): boolean => document.documentElement.hasAttribute('data-welcoming') || document.documentElement.hasAttribute('data-touring')
  const [welcomeUp, setWelcomeUp] = useState(busy)
  // An example on the page already says what it is for and what to try: never both at once.
  const example = (): boolean => document.documentElement.hasAttribute('data-example-on')
  const [exampleUp, setExampleUp] = useState(example)
  useEffect(() => {
    const watch = new MutationObserver(() => (setWelcomeUp(busy()), setExampleUp(example())))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-welcoming', 'data-touring', 'data-example-on'] })
    return () => watch.disconnect()
  }, [])
  // Taught by the example instead: the page's line is put away for good, so it never comes after to say it again.
  const text = HINTS[page]
  const waiting = !!text && !!state && (state.welcomed || state.sandbox) && state.pageHints && !state.hintsSeen.includes(page) && !gone.includes(page)
  useEffect(() => {
    if (!exampleUp || !waiting || !state) return
    setGone((was) => [...was, page])
    void onboarding.set({ hintsSeen: [...state.hintsSeen, page] })
  }, [exampleUp, waiting, page]) // eslint-disable-line react-hooks/exhaustive-deps
  if (arrival && !welcomeUp) {
    return (
      <Line name="sandbox-arrival" onDone={() => (chime('tap'), setArrival(false))} done="Got it">
        <strong>You’re in the sandbox: a peek into someone else’s book.</strong> Their reading, films, questions and goals. Look around and try anything; your own notes are safe.
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
        <strong>New: a welcome tour, and a sandbox.</strong> The sandbox is a peek into someone else’s book, to try anything in, apart from your notes.{' '}
        <button type="button" onClick={() => (done(), playWelcome())} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Show the welcome</button>
        {' or '}
        <button type="button" onClick={() => {
          done()
          chime('scene')
          toast(`Opening the sandbox. ${APP_NAME} restarts in a moment.`, undefined, 'info')
          void enterSandbox().catch(() => toast('The sandbox could not open just now.', undefined, 'warning'))
        }} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">open the sandbox</button>.
      </Line>
    )
  }

  if (exampleUp) return null
  // A list's line is about the list: not over a note open on it.
  if (noteOpen && LISTS.includes(page)) return null
  // Home has Getting started under it while that is there: one guide at a time.
  if (page === 'home' && !state.sandbox && !state.hidden && !state.doneAt) return null
  // The sandbox is never welcomed (it has its own way in), but its pages say what they are for too.
  const seen = !text || !(state.welcomed || state.sandbox) || !state.pageHints || state.hintsSeen.includes(page) || gone.includes(page)
  const put = (): void => {
    setGone((was) => [...was, page])
    void onboarding.set({ hintsSeen: [...state.hintsSeen, page] })
  }
  const done = (): void => (chime('tap'), put())
  showing.current = seen || got === page ? null : put
  // The lead-in is there with the line, so it reads at a glance; the rest types in after it.
  const { lead, rest } = splitLead(text ?? '')
  // Folded away as it goes (Got it, or learned), rather than vanishing.
  return (
    <AnimatePresence initial={false}>
      {!seen && (
        <Line key={page} name={page} onDone={done} done="Got it" learned={got === page}>
          {got === page ? <strong>You’ve got it.</strong> : <>
          <strong>{lead}</strong> <Typed text={rest} delay={0} within={220} />
          {/* Home's line: the five-stop tour, again. */}
          {page === 'home' && <>{' '}<button type="button" onClick={() => (chime('tap'), window.dispatchEvent(new CustomEvent('haligtree:tour-stops')))} className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">Show me around</button></>}
          </>}
        </Line>
      )}
    </AnimatePresence>
  )
}

function Line({ name, children, onDone, done, learned = false }: { name: string; children: React.ReactNode; onDone: () => void; done: string; /** Just done for the first time: the line says so, with no button. */ learned?: boolean }): React.JSX.Element {
  // A beat after the page, every time: there with the first paint it read as
  // part of the furniture, and was skipped. Its room is kept from the start, so
  // nothing moves when it comes; with Motion off it is simply there.
  const first = useFirstVisit(`hint:${name}`)
  const [enter] = useState(() => document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  return (
    // Going, it fades first (opacity, on the compositor), then folds by one
    // height, its padding and edge clipped inside it rather than each sprung
    // too. The fold stays a height: the page under it has to rise with it,
    // and a clip or a scale would leave the room and close it with a jump.
    <motion.div className="shrink-0 overflow-hidden" exit={{ opacity: 0, height: 0, transition: { opacity: { duration: 0.12, ease: EASE }, height: { duration: 0.2, delay: 0.06, ease: EASE } } }}>
    <motion.div role="note"
      initial={enter ? { opacity: 0, transform: shift(first ? 'translateY(-4px)' : 'translateY(0px)') } : false}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      transition={{ duration: 0.2, ease: EASE }}
      className="flex shrink-0 items-start gap-3 overflow-hidden rounded-xl border border-foreground/[0.07] bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)] py-2 pr-1.5 pl-3.5 text-control text-muted-foreground">
      <Lightbulb aria-hidden className="mt-[0.4rem] size-3.5 shrink-0 text-primary" strokeWidth={2} />
      <p className="mf-prose min-w-0 flex-1 py-px text-[0.9375rem]">{children}</p>
      {learned ? <span aria-hidden className="h-7" /> : (
      <button type="button" onClick={onDone} className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.07] hover:text-foreground">
        {done}
        <X aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
      )}
    </motion.div>
    </motion.div>
  )
}
