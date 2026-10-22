import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { useStill } from '@/lib/motion'
import { CalendarRange, Check, X } from 'lucide-react'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import { chime } from '@/lib/sound'
import { GROUPS, POWERS, SEEN_KEY, useUsed, type Power } from '@/lib/powers'
import { SANDBOX, enterSandbox } from '@/lib/sandbox'
import { useOnboarding } from '@/lib/onboarding'
import { AliveIcon } from '@/components/ui/alive-icon'
import { DEMOS } from './power-demos'
import { PlaceIcon, SECTIONS, type Place } from './places'
import { Pressed, SmoothScroll, toast } from './ui'
import { ProgressBar } from './progress-bar'
import { LearnOffer } from './study'
import { PageContents } from './page-contents'
import './powers.css'
import { APP_NAME } from '../../../../main/name'
import { num } from '../../../../main/dates'

/**
 * What Vigil can do: every power the app keeps out of sight until you need
 * it, a card each, in seven groups, and every page after them. Each card
 * shows its power working, in miniature, says in a line what it gives you,
 * shows its keys, and has Show me: in the sandbox it opens the real place
 * and points at it (the tour's spotlight); in your own notes it opens the
 * place, and where there is nothing yet to point at, offers the sandbox.
 * A soft tick marks what your own notes say you have already used.
 */
export function PowersView({ onView }: { onView: (id: string, focus?: string) => void }): React.JSX.Element {
  const used = useUsed()
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Home simply keeps offering the page.
    }
  }, [])
  const tried = used ? POWERS.filter((power) => used.has(power.id)).length : 0
  // Said after each group's name in the contents: how many of its cards you have tried.
  const note = (group: string): string => {
    const all = POWERS.filter((power) => power.group === group)
    return `${all.filter((power) => used?.has(power.id)).length} of ${all.length}`
  }
  // The column, for the contents beside it to read.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  return (
    <SmoothScroll beside={(box) => <PageContents page={column} scroller={box} label="Sections on this page" />}>
      <div ref={setColumn} className="w-full px-5 pt-10 pb-24 @[44rem]/page:px-10">
        <header className="max-w-[40rem]">
          <h1 className="font-heading text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground">What {APP_NAME} can do</h1>
          <p className="mf-prose mt-3 text-[1.1875rem] text-muted-foreground">
            <strong>Most of {APP_NAME} stays out of sight until you need it.</strong> Press “Show me” on a card to see it {SANDBOX ? 'in a real example.' : 'where it lives.'}
          </p>
          {/* How far through, always: from 0, so there is something to fill. */}
          <div data-powers-tried className="mt-4 flex max-w-[22rem] flex-col gap-1.5">
            <p className="flex items-center gap-2 text-control text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{tried} of {POWERS.length}</span> tried
            </p>
            <ProgressBar value={tried / POWERS.length} label={`${tried} of ${num(POWERS.length)} tried`} thick={3} />
          </div>
          {/* The same, as cards: about twenty questions on what is here, asked in Review a few a day. */}
          <LearnOffer className="-ml-2 mt-3" />
        </header>
        {GROUPS.map((group) => (
          <section key={group.id} id={`powers-${slug(group.id)}`} aria-label={group.id} data-group={group.id} data-group-note={note(group.id)} className="mt-14 scroll-mt-6">
            <h2 className="font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">{group.id}</h2>
            <p className="mf-aside mt-1 text-body text-muted-foreground">{group.line}</p>
            {/* One column a group: each card its picture beside its words, read down like a list. */}
            <div className="mt-5 flex flex-col gap-3">
              {POWERS.filter((power) => power.group === group.id).map((power) => (
                <Card key={power.id} power={power} used={!!used?.has(power.id)} onView={onView} />
              ))}
            </div>
          </section>
        ))}
        <Pages onView={onView} />
      </div>
    </SmoothScroll>
  )
}

/** A sentence of its own after "Try it.": its first letter a capital. */
const upper = (text: string): string => text[0].toUpperCase() + text.slice(1)
const slug = (text: string): string => text.toLowerCase().replace(/\W+/g, '-')

/** The soft tick: done, said quietly. */
const Tick = (): React.JSX.Element => (
  <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--tt-color-highlight-green)', color: 'var(--tt-color-text-green)' }}>
    <Check className="size-2.5" strokeWidth={3.5} />
  </span>
)

function Card({ power, used, onView }: { power: Power; used: boolean; onView: (id: string, focus?: string) => void }): React.JSX.Element {
  const stage = useRef<HTMLDivElement>(null)
  // Plays only while most of it is on screen, and never with Motion off or Reduce motion.
  const seen = useInView(stage, { amount: 0.6 })
  // Read live: Motion turned off with the page open stops the demos' steps at once.
  const calm = useStill()
  const Demo = DEMOS[power.id]
  return (
    <article data-power={power.id} className="flex flex-col rounded-2xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] p-1.5 @[40rem]/page:flex-row">
      <div className="relative @[40rem]/page:w-[20rem] @[40rem]/page:shrink-0">
        {/* 9px: the card's 16px corner less its 6px edge and 1px line, so the corners nest. */}
        {/* Held to itself (contain): a demo's fold grows its card by height,
            which a fold has to (a clip would leave the card's edge where it
            was), and contained, each frame of it lays out only this stage. */}
        <div ref={stage} aria-hidden className="pw-stage relative flex h-44 items-center justify-center overflow-hidden rounded-[9px] border border-border/50 bg-background px-5 [contain:strict]">
          {Demo && <Demo live={seen && !calm} />}
        </div>
        {used && <span className="absolute top-2.5 right-2.5" title="You have used this"><Tick /><span className="sr-only">You have used this</span></span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-3 pt-3.5 pb-2 @[40rem]/page:px-4 @[40rem]/page:pt-3">
        {/* Dia's way: the name, bold, is the sentence's start; the rest only for whoever wants it. */}
        <div className="mf-prose text-[0.9375rem] text-muted-foreground">
          <h3 className="inline font-semibold text-foreground">{power.name}.</h3> {power.line}
        </div>
        {/* The instruction, so it leads at full ink: a skimmer finds it. */}
        <p className="mt-2 text-control text-muted-foreground"><strong className="font-semibold text-foreground">Try it.</strong> {upper(power.tryIt ?? power.show.text)}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-4">
          {power.keys?.map((keys) => <span key={keys} className="flex gap-0.5"><Pressed keys={keys} each={!keys.includes(' ')} /></span>)}
          <button type="button" onClick={() => void showMe(power, onView)}
            className="group/show -mr-1 ml-auto flex h-7 items-center gap-1 rounded-md pr-1.5 pl-2.5 text-control font-medium text-foreground/85 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
            Show me <AliveIcon icon={ArrowNarrowRightIcon} size={14} className="text-muted-foreground transition-transform duration-150 group-hover/show:translate-x-0.5" />
          </button>
        </div>
      </div>
    </article>
  )
}

/** The page card, where what Show me points at lives. */
const page = (): Element | null => document.querySelector('.\\@container\\/page')

/** What to point at, once the page has come in: the first match, or the first holding the words asked for. */
function find(at: string, words?: string): Element | null {
  const all = [...(page()?.querySelectorAll(at) ?? [])].filter((one) => (one as HTMLElement).offsetParent)
  if (!words) return all[0] ?? null
  const word = words.replace(/^#/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const test = new RegExp(`(^|[^\\w])${words.startsWith('#') && at === 'p' ? '#' : ''}${word}([^\\w]|$)`, 'i')
  // A row whose own name is the word (a tag row reads "book", then its note), else any holding it.
  // Its accessible name counts too: a rolling label's letters are drawn twice over.
  const named = (one: Element): boolean => [one, ...one.querySelectorAll('*')].some((part) => [part === one ? null : part.textContent, part.getAttribute('aria-label')].some((said) => said?.trim().replace(/^#/, '').toLowerCase() === words.replace(/^#/, '').toLowerCase()))
  return all.find(named) ?? all.find((one) => test.test(one.textContent ?? '')) ?? null
}
const waitFor = (at: string, words?: string): Promise<Element | null> => new Promise((done) => {
  const start = performance.now()
  const look = (): void => {
    const hit = find(at, words)
    if (hit || performance.now() - start > 2500) return done(hit)
    setTimeout(look, 120)
  }
  setTimeout(look, 250)
})

/** Take you there and point at it: What Vigil can do's Show me, and What's new's. */
export async function showMe(power: Pick<Power, 'name' | 'keys' | 'show'>, onView: (id: string, focus?: string) => void): Promise<void> {
  const show = power.show
  chime('tap')
  if (show.box) {
    window.api.showPrompt()
    return toast(show.text, undefined, 'info')
  }
  if (show.settings) {
    try {
      localStorage.setItem('settings:section', show.settings)
    } catch {
      // Settings opens where it last was.
    }
  }
  onView(show.view!, await show.focus?.())
  if (!show.at) return toast(show.text, undefined, 'info')
  const hit = await waitFor(show.at, show.find)
  if (!hit) {
    // Nothing of yours to show it on yet: the sandbox has an example.
    if (!SANDBOX) return toast(show.text, undefined, 'info', { label: 'Try in the sandbox', key: 's', run: () => void enterSandbox() })
    return toast(show.text, undefined, 'info')
  }
  document.querySelectorAll('[data-pointed]').forEach((one) => one.removeAttribute('data-pointed'))
  hit.setAttribute('data-pointed', '')
  window.dispatchEvent(new CustomEvent('vigil:point', { detail: { title: power.name, text: show.text, keys: power.keys, at: '[data-pointed]', sandbox: !SANDBOX } }))
}

/** Each page, a line on what it is for. */
const PAGE_LINES: Record<string, string> = {
  home: 'What comes back to you today, and shelves of what you kept.',
  inbox: 'Everything you catch, waiting to be looked at.',
  review: 'Gems asking to be remembered, a few a day.',
  day: 'A page to write on for each day.',
  weekpage: 'The week in a few lines.',
  monthpage: 'The month, and the season of life it was.',
  yearpage: 'Your year as seasons of life, month by month.',
  today: 'What to do today.',
  week: 'Seven days of tasks side by side.',
  upcoming: 'Everything with a date, in order.',
  matrix: 'Tasks by urgent and important.',
  routines: 'What repeats.',
  later: 'This month, this year, someday.',
  nuggets: 'What you kept, in your own words.',
  articles: 'What you write from your gems.',
  questions: 'Questions you are holding open.',
  goals: 'Days you are working toward.',
  tags: 'Every tag, and what some of them do.',
  stats: `How you have been using ${APP_NAME}.`,
  map: 'Your linked notes as dots and lines.',
  all: 'Every note you have caught.',
  discarded: 'What you moved to the Bin, still there to bring back.',
  archived: 'Kept, out of sight. Find it again here.'
}

function Pages({ onView }: { onView: (id: string) => void }): React.JSX.Element {
  // The Year has no letter of its own: it sits after the month, reached from the pages' Day, Week, Month, Year.
  const list: (Place & { key?: string })[] = SECTIONS.filter((section) => PAGE_LINES[section.id])
  list.splice(list.findIndex((section) => section.id === 'monthpage') + 1, 0, { id: 'yearpage', label: 'Year', icon: CalendarRange, tint: 'yellow' })
  return (
    <section id="powers-every-page" aria-label="Every page" data-group="Every page" className="mt-14 scroll-mt-6">
      <h2 className="font-heading text-heading font-semibold tracking-[-0.01em] text-foreground">Every page</h2>
      <p className="mt-1 text-control text-muted-foreground">G and a letter goes to each one from anywhere in the window.</p>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-x-6 @[40rem]/page:grid-cols-2 @[66rem]/page:grid-cols-3">
        {list.map((section) => (
          <button key={section.id} type="button" onClick={() => (chime('tap'), onView(section.id))}
            className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-foreground/[0.05]">
            <span className="mt-0.5"><PlaceIcon place={section} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-control font-medium text-foreground">{section.label}</span>
              <span className="block text-meta leading-relaxed text-muted-foreground">{PAGE_LINES[section.id]}</span>
            </span>
            {section.key && <span className="mt-0.5 flex gap-0.5 opacity-70"><Pressed keys={`G ${section.key.toUpperCase()}`} /></span>}
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * One line on Home for someone new: Vigil does more than it shows. Gone once
 * the page has been opened, or put away by hand.
 */
export function PowersLine({ onView }: { onView: (id: string) => void }): React.JSX.Element | null {
  const state = useOnboarding()
  const [gone, setGone] = useState(() => {
    try {
      return !!localStorage.getItem(SEEN_KEY)
    } catch {
      return false
    }
  })
  if (gone || !state) return null
  const fresh = state.sandbox || (!!state.welcomed && Date.now() - new Date(state.welcomed).getTime() < 30 * 86400000)
  // Getting started is up and says the same in its last line.
  const shelf = !state.sandbox && !!state.welcomed && !state.hidden && !(state.doneAt && Date.now() - new Date(state.doneAt).getTime() > 3 * 86400000)
  if (!fresh || shelf) return null
  const away = (): void => {
    chime('fold')
    setGone(true)
    try {
      localStorage.setItem(SEEN_KEY, 'hidden')
    } catch {
      // Back next time, then.
    }
  }
  return (
    <div className="mx-5 flex items-center gap-1 text-control text-muted-foreground @[44rem]/page:mx-8">
      <button type="button" onClick={() => (chime('tap'), onView('powers'))} className="group -ml-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-foreground/[0.05]">
        <span className="truncate">{APP_NAME} does more than it shows.</span>
        <span className="shrink-0 text-foreground underline decoration-foreground/25 underline-offset-4 group-hover:decoration-foreground/60">See what it can do</span>
      </button>
      <button type="button" aria-label="Hide this" onClick={away} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  )
}
