import { useEffect, useRef, useState } from 'react'
import { useStepped } from '@/lib/nav'
import { step } from '@/lib/sound'
import { BookOpen, Brain, Inbox, Laptop, LayoutGrid, ListTodo, Pencil, Sun } from '@/components/ui/icons'
import { SectionSearch, SectionTabs, type SectionTab } from './section-tabs'
import { useReading } from '@/lib/reads-in'
import { useStill } from '@/lib/motion'
import { CalendarRange, Check, X } from 'lucide-react'
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon'
import { chime } from '@/lib/sound'
import { FOCUS_POWERS, GROUPS, POWERS, SEEN_KEY, useUsed, type Power } from '@/lib/powers'
import { haligtree, useFocusTools, useLive } from '@/lib/haligtree'
import { lacks, meets, useCaps, WHICH, type Caps } from '@/lib/needs'
import { SANDBOX, enterSandbox } from '@/lib/sandbox'
import { useOnboarding } from '@/lib/onboarding'
import { AliveIcon } from '@/components/ui/alive-icon'
import { DEMOS, DemoLive } from './power-demos'
import { PlaceIcon, SECTIONS, type Place } from './places'
import { BackToTop, MoreBelow, Pressed, toast, useSmooth } from './ui'
import { ProgressBar } from './progress-bar'
import { LearnOffer } from './study'
import './powers.css'
import { APP_NAME } from '../../../../main/name'
import { num, plural } from '../../../../main/dates'

/** The page's tabs, as Settings' sections: one group of cards each, writing first, and every page last. */
const EVERY_PAGE = 'Every page'
const TAB_LOOKS: Record<string, Omit<SectionTab, 'title'>> = {
  Writing: { icon: Pencil, tint: 'orange' },
  Catching: { icon: Inbox, tint: 'blue' },
  'Reading and questions': { icon: BookOpen, tint: 'brown' },
  Remembering: { icon: Brain, tint: 'pink' },
  'Tasks and time': { icon: ListTodo, tint: 'green' },
  'Days and seasons': { icon: Sun, tint: 'yellow' },
  'Windows and your Mac': { icon: Laptop, tint: 'purple' },
  [EVERY_PAGE]: { icon: LayoutGrid, tint: 'gray' }
}
const TABS: SectionTab[] = [...GROUPS.map((group) => group.id), EVERY_PAGE].map((title) => ({ title, ...TAB_LOOKS[title] }))
const TAB_KEY = 'powers:tab'

/**
 * What Haligtree can do: every power the app keeps out of sight until you need
 * it, a card each, in tabs down the left as Settings has, and every page in
 * the last. Only the open tab's cards are drawn: all hundred on one page took
 * a second to open and stalled its scrolling (qa/powers-speed.mjs). The tab on
 * show is remembered, and each change of tab is a step Back and Forward find.
 * Each card shows its power working, in miniature, says in a line what it
 * gives you, shows its keys, and has Show me: in the sandbox it opens the real
 * place and points at it (the tour's spotlight); in your own notes it opens
 * the place, and where there is nothing yet to point at, offers the sandbox.
 * A soft tick marks what your own notes say you have already used.
 */
export function PowersView({ onView }: { onView: (id: string, focus?: string) => void }): React.JSX.Element {
  const used = useUsed()
  // The focus timer turned off: its powers are not here, only the line saying where it is turned on.
  const focusTools = useFocusTools()
  const pinned = useLive(haligtree.settings, null)?.powersPinned
  const powers = focusTools ? POWERS : POWERS.filter((power) => !FOCUS_POWERS.has(power.id))
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Home simply keeps offering the page.
    }
  }, [])
  const caps = useCaps()
  const [tab, setTabState] = useState(() => {
    try {
      const kept = localStorage.getItem(TAB_KEY)
      return TABS.some((one) => one.title === kept) ? kept! : TABS[0].title
    } catch {
      return TABS[0].title
    }
  })
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  useSmooth(scroller)
  // Back and Forward bring a tab with their own sound; a click or key plays its note too.
  const showTab = (title: string): void => {
    setTabState(title)
    if (scroller) scroller.scrollTop = 0
    try {
      localStorage.setItem(TAB_KEY, title)
    } catch {
      // Not remembered, but still shown.
    }
  }
  useStepped(tab, showTab)
  const [query, setQuery] = useState('')
  const searching = !!query.trim()
  const pick = (title: string): void => {
    if (searching) (chime('fold'), setQuery(''))
    if (title === tab) return
    step(TABS.findIndex((one) => one.title === title))
    showTab(title)
  }
  // Searching, the cards of every tab whose words hold it; else the open tab's.
  const words = query.trim().toLowerCase()
  const shown = searching
    ? powers.filter((power) => [power.name, power.line, power.tryIt ?? '', power.group].some((said) => said.toLowerCase().includes(words)))
    : powers.filter((power) => power.group === tab)
  // What this Mac lacks is still listed, marked, but not counted as there to try.
  const here = shown.filter((power) => meets(caps, power.needs))
  const tried = used ? here.filter((power) => used.has(power.id)).length : 0
  const group = GROUPS.find((one) => one.id === tab)
  const working = powers.filter((power) => meets(caps, power.needs))
  return (
    <section className="grid min-h-0 min-w-0 flex-1 grid-cols-[3.5rem_1fr] grid-rows-[auto_1fr] @[44rem]/page:grid-cols-[12.5rem_1fr] @[52rem]/page:grid-cols-[14rem_1fr]">
      <SectionTabs
        sections={TABS}
        section={tab}
        searching={searching}
        pick={pick}
        label={`What ${APP_NAME} can do`}
        className="col-start-1 row-span-2 row-start-1 pt-4 pb-4 @[44rem]/page:row-span-1 @[44rem]/page:row-start-2 @[44rem]/page:pt-0"
      />
      <SectionSearch query={query} setQuery={setQuery} className="col-start-2 row-start-1 mx-5 mt-4 mb-2 @[44rem]/page:col-start-1 @[44rem]/page:mx-2" />
      <div className="relative col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col @[44rem]/page:row-span-2 @[44rem]/page:row-start-1">
        <div ref={setScroller} className="mf-more min-h-0 flex-1 overflow-y-auto">
          <div data-powers-tab={searching ? '' : tab} className="@container/powers w-full max-w-2xl px-6 pt-4 pb-16">
            <header className="px-1">
              {!searching && <h2 className="text-lg font-semibold text-foreground">{tab}</h2>}
              {searching ? (
                <p className="text-body text-muted-foreground">{shown.length ? `${plural(shown.length, 'card holds', 'cards hold')} “${query.trim()}”.` : `Nothing here matches “${query.trim()}”. Try fewer letters, or what it does.`}</p>
              ) : (
                <p className="mt-1 text-body text-muted-foreground">{group ? group.line : `Most of ${APP_NAME} stays out of sight until you need it. These are its pages: G and a letter goes to each one from anywhere in the window.`}</p>
              )}
              {/* How far through this tab, always: from 0, so there is something to fill. */}
              {here.length > 0 && (
                <div data-powers-tried className="mt-4 flex max-w-[22rem] flex-col gap-1.5">
                  <p className="flex items-center gap-2 text-control text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{num(tried)} of {num(here.length)}</span> tried
                  </p>
                  <ProgressBar value={tried / here.length} label={`${tried} of ${num(here.length)} tried`} thick={3} />
                </div>
              )}
              {tab === EVERY_PAGE && !searching && (
                <>
                  <ThisMac caps={caps} missing={powers.length - working.length} />
                  {/* The same, as cards: about twenty questions on what is here, asked in Review a few a day. */}
                  <LearnOffer className="-ml-2 mt-3" />
                </>
              )}
              {/* Unpinned from the sidebar's Pinned: one way to put it back, where it is missed. */}
              {pinned === false && (
                <button type="button" data-powers-repin className="mt-3 flex items-center gap-1.5 text-control font-medium text-(--mf-muted-strong) underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                  onClick={() => (chime('tap'), void haligtree.setSettings({ powersPinned: true }))}>
                  Pin this page to the sidebar
                </button>
              )}
              {!focusTools && tab === 'Tasks and time' && !searching && (
                <p data-powers-focus-off className="mt-4 text-body text-muted-foreground">
                  The focus timer and website blocking are turned off.{' '}
                  <button type="button" className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                    onClick={() => void showMe({ name: 'Focus timer and site blocking', show: { view: 'settings', settings: 'Tasks', find: 'Focus timer and site blocking', at: '[data-setting]', text: 'Turn it on here.' } }, onView)}>
                    Turn them on in Settings, under Tasks
                  </button>
                </p>
              )}
            </header>
            {tab === EVERY_PAGE && !searching ? <Pages onView={onView} /> : (
              // One column: each card its picture beside its words, read down like a list.
              <div className="mt-6 flex flex-col gap-3">
                {shown.map((power, at) => (
                  <Card key={power.id} power={power} used={!!used?.has(power.id)} caps={caps} onView={onView} first={at < FIRST} />
                ))}
              </div>
            )}
          </div>
        </div>
        <BackToTop target={scroller} />
        <MoreBelow target={scroller} />
      </div>
    </section>
  )
}

/** A sentence of its own after "Try it.": its first letter a capital. */
const upper = (text: string): string => text[0].toUpperCase() + text.slice(1)

/** The soft tick: done, said quietly. */
const Tick = (): React.JSX.Element => (
  <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--mf-chip-bg-green)', color: 'var(--mf-chip-ink-green)' }}>
    <Check className="size-2.5" strokeWidth={3.5} />
  </span>
)

/**
 * On this Mac: whether everything on the page works here, said once at the top,
 * so nothing is promised to a Mac that cannot do it. Room kept from the first
 * frame: the answer comes from main a moment after the page.
 */
function ThisMac({ caps, missing }: { caps: Caps | null; missing: number }): React.JSX.Element {
  return (
    <p data-this-mac={caps ? missing : ''} className="mt-4 min-h-[1.5rem] text-control text-muted-foreground">
      {caps && (
        <>
          <strong className="font-semibold text-foreground">On this Mac{caps.major ? ` (macOS ${caps.macos.replace(/\.0$/, '')})` : ''}.</strong>{' '}
          {missing ? `${plural(missing, 'feature needs', 'features need')} a newer Mac or Apple Intelligence, and ${missing === 1 ? 'says' : 'say'} so on ${missing === 1 ? 'its card' : 'their cards'}; the rest work here.` : 'Everything here works.'}{' '}
          <span data-not-yet>Not on any Mac yet: Siri and Shortcuts, a widget, and keeping quiet in a Focus, which need parts this build of {APP_NAME} cannot carry.</span>
        </>
      )}
    </p>
  )
}

/** How much of each card's stage is in view; the one most in view is the one on stage. */
const shown = new Map<Element, number>()
const heard = new Set<() => void>()
let onStage: Element | null = null
const watcher = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((all) => {
  for (const one of all) shown.set(one.target, one.isIntersecting ? one.intersectionRatio : 0)
  let best: Element | null = null
  for (const [el, ratio] of shown) if (ratio >= 0.6 && (!best || ratio > shown.get(best)!)) best = el
  if (best !== onStage) (onStage = best), heard.forEach((tell) => tell())
}, { threshold: [0, 0.6, 0.7, 0.8, 0.9, 1] })
function useOnStage(ref: React.RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !watcher) return
    const tell = (): void => setOn(onStage === el)
    heard.add(tell)
    watcher.observe(el)
    return () => {
      heard.delete(tell)
      watcher.unobserve(el)
      shown.delete(el)
      if (onStage === el) onStage = null
    }
  }, [ref])
  return on
}

/**
 * The cards a tab opens on, their pictures drawn with the page; the rest draw
 * theirs as they come within a screen of the view. All of a tab's pictures in
 * the first frame was most of the time it took to open (qa/powers-speed.mjs).
 */
const FIRST = 4
const near = new Map<Element, () => void>()
const nearing = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((all) => {
  for (const one of all) if (one.isIntersecting) near.get(one.target)?.()
}, { rootMargin: '100% 0px' })
/** True once the stage is within a screen of the view, and from then on; at once for the cards the tab opens on. */
function useNear(ref: React.RefObject<HTMLElement | null>, first: boolean): boolean {
  const [on, setOn] = useState(first || !nearing)
  useEffect(() => {
    const el = ref.current
    if (on || !el || !nearing) return
    near.set(el, () => setOn(true))
    nearing.observe(el)
    return () => (near.delete(el), nearing.unobserve(el))
  }, [ref, on])
  return on
}

function Card({ power, used, caps, onView, first }: { power: Power; used: boolean; caps: Caps | null; onView: (id: string, focus?: string) => void; /** One of the cards the tab opens on: its picture comes with the page. */ first: boolean }): React.JSX.Element {
  const has = meets(caps, power.needs)
  const stage = useRef<HTMLDivElement>(null)
  const drawn = useNear(stage, first)
  // Plays only while it is the card most in view, and never with Motion off or
  // Reduce motion. One at a time: with three or four playing together, each
  // step of each one laid the whole page out again, and it opened and
  // scrolled in jerks (qa/powers-speed.mjs).
  const seen = useOnStage(stage)
  // Read live: Motion turned off with the page open stops the demos' steps at once.
  const calm = useStill()
  const Demo = DEMOS[power.id]
  return (
    <article data-power={power.id} data-mac-needs={power.needs ?? 'every'} data-mac-lacking={has ? undefined : ''} className="flex flex-col rounded-2xl border bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)] p-1.5 @[34rem]/powers:flex-row">
      <div className="relative @[34rem]/powers:w-[20rem] @[34rem]/powers:shrink-0">
        {/* 9px: the card's 16px corner less its 6px edge and 1px line, so the corners nest. */}
        {/* Held to itself (contain): a demo's fold grows its card by height,
            which a fold has to (a clip would leave the card's edge where it
            was), and contained, each frame of it lays out only this stage. */}
        <div ref={stage} aria-hidden className="pw-stage relative flex h-44 items-center justify-center overflow-hidden rounded-[9px] border border-border/50 bg-background px-5 [contain:strict]">
          {Demo && drawn && <DemoLive.Provider value={seen && !calm}><Demo live={seen && !calm} /></DemoLive.Provider>}
        </div>
        {used && <span className="absolute top-2.5 right-2.5" title="You have used this"><Tick /><span className="sr-only">You have used this</span></span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-3 pt-3.5 pb-2 @[34rem]/powers:px-4 @[34rem]/powers:pt-3">
        {/* Dia's way: the name, bold, is the sentence's start; the rest only for whoever wants it. */}
        <div className="mf-prose text-[0.9375rem] text-muted-foreground">
          <h3 className="inline font-semibold text-foreground">{power.name}.</h3> {power.line}
        </div>
        {/* The instruction, so it leads at full ink: a skimmer finds it. */}
        <p className="mt-2 text-control text-muted-foreground"><strong className="font-semibold text-foreground">Try it.</strong> {upper(power.tryIt ?? power.show.text)}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-4">
          {power.keys?.map((keys) => <span key={keys} className="flex gap-0.5"><Pressed keys={keys} each={!keys.includes(' ')} /></span>)}
          {/* Which Macs, quietly, where it works; where it does not, what it needs, at full ink, in Show me's place. */}
          {has && <span data-which className="ml-1 text-meta text-muted-foreground">{WHICH[power.needs ?? 'every']}</span>}
          {!has ? (
            <span data-needs={power.needs} className="ml-auto flex h-7 items-center text-control font-medium text-foreground">{lacks(caps, power.needs!)}</span>
          ) : <button type="button" onClick={() => void showMe(power, onView)}
            className="group/show -mr-1 ml-auto flex h-7 items-center gap-1 rounded-md pr-1.5 pl-2.5 text-control font-medium text-foreground/85 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]">
            Show me <AliveIcon icon={ArrowNarrowRightIcon} size={14} className="text-muted-foreground transition-transform duration-150 group-hover/show:translate-x-0.5" />
          </button>}
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

/** Take you there and point at it: What Haligtree can do's Show me, and What's new's. */
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
  window.dispatchEvent(new CustomEvent('haligtree:point', { detail: { title: power.name, text: show.text, keys: power.keys, at: '[data-pointed]', sandbox: !SANDBOX } }))
}

/** Each page, a line on what it is for. */
const PAGE_LINES: Record<string, string> = {
  home: 'What comes back to you, and shelves of what you kept.',
  day: 'The day\'s writing on top, its tasks under it.',
  articles: 'What you write, and the questions you hold open.',
  inbox: 'Everything you catch, waiting to be looked at; “Show dealt with too” lists the rest.',
  nuggets: 'What you kept, in your own words.',
  review: 'Gems asking to be remembered, a few a day.',
  today: 'Today, Upcoming, Later and Routines, as tabs.',
  calendar: 'Your days by the hour.',
  weekpage: 'The week in a few lines, then its tasks.',
  monthpage: 'The month, and the season of life it was.',
  lookups: 'Words and terms waiting for a meaning.',
  goals: 'Days you are working toward.',
  queue: 'What you mean to read next.',
  tags: 'Every tag, and what some of them do.',
  sources: 'The people and works your notes come from.',
  stats: `How you have been using ${APP_NAME}.`,
  map: 'Your linked notes as dots and lines.',
  media: 'Every picture, GIF, PDF and recording in your book, in one grid. Add more with “Add”, no note needed.',
  discarded: 'What you moved to the Bin, still there to bring back.',
  archived: 'Kept, out of sight. Find it again here.'
}

function Pages({ onView }: { onView: (id: string) => void }): React.JSX.Element {
  // The Year has no letter of its own: it sits after the month, reached from the pages' Day, Week, Month, Year.
  const list: (Place & { key?: string })[] = SECTIONS.filter((section) => PAGE_LINES[section.id])
  list.splice(list.findIndex((section) => section.id === 'monthpage') + 1, 0, { id: 'yearpage', label: 'Year', icon: CalendarRange, tint: 'yellow' })
  return (
    <section id="powers-every-page" aria-label="Every page" data-group="Every page" className="mt-4">
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-x-6 @[34rem]/powers:grid-cols-2">
        {list.map((section) => (
          <button key={section.id} type="button" onClick={() => (chime('tap'), onView(section.id))}
            className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-foreground/[0.05]">
            <span className="mt-0.5"><PlaceIcon place={section} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-control font-medium text-foreground">{section.label}</span>
              <span className="block text-meta leading-relaxed text-muted-foreground">{PAGE_LINES[section.id]}</span>
            </span>
            {section.key && <span className="mt-0.5 flex gap-0.5"><Pressed keys={`G ${section.key.toUpperCase()}`} /></span>}
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * One line on Today for someone new: Haligtree does more than it shows. Gone once
 * the page has been opened, or put away by hand.
 */
export function PowersLine({ onView }: { onView: (id: string) => void }): React.JSX.Element | null {
  const state = useOnboarding()
  useReading(!state)
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
    <div className="flex items-center gap-1 text-control text-muted-foreground">
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
