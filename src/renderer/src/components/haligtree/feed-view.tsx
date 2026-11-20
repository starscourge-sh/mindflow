import { PlainField, type PlainHandle } from './presets'
import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStepped } from '@/lib/nav'
import { heroAround, heroOpen } from '@/lib/hero'
import { hoverNote, hoverThought } from './note-preview'
import { ArrowLeft, ArrowUpRight, Check, FileText, Heart, CornerDownRight, EyeOff, ImageDown, MessageCircle, Repeat2, RefreshCcw, Share, Trash2, X } from 'lucide-react'

import { call, haligtree, splitTags, unloaded, unread, useLive, type Gloss } from '@/lib/haligtree'
import { thumbsRead, useThumb } from '@/lib/notes'
import { useDecoded } from '@/lib/decoded'
import { chime, type Cue } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { TabChips } from './tab-chips'
import { ago, dayjs, num, plural } from '../../../../main/dates'
import type { Feed, FeedPost, FeedSide, PollAnswer, Reaction } from '../../../../main/feed'
import { useGrades } from './review-view'
import { backIn } from '@/lib/back-in'
import { openSource, sources, type SourceSummary } from '@/lib/sources'
import { distinctInitials } from '@/lib/people'
import { MenuRows, Kbd, Page, Tip, jumpTo, openTag, quietly, toast, typing } from './ui'
import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu'
import { ListSearch, matches } from './note-list'
import { Switch } from '@/components/ui/switch'
import { Avatar } from './avatar'
import { GlossLine, cutWords, openGloss } from './gloss-line'
import { MenuButton } from './collection-header'
import { copyLinkItem, type MenuItem } from './row-menu'
import { dayLinkName } from './day-view'
import { moveToBin } from '@/lib/to-bin'
import { GoalPreview, ReadyMoment, useReady } from './goal-preview'
import { FeedReading } from './feed-reading'
import { QueuedProvider, ReadLaterLabelled } from './read-later'
import { drawCard, xText, type CardPost } from '@/lib/feed-card'
import { LOOKABLE, lookAtPicture } from '@/components/image/image-look'
import { openAside } from '@/lib/split'
import { FeedLiked } from './feed-liked'
import { ChangedLink } from './changed-line'
import { RowMenu } from './row-menu'
import { useHere } from '@/lib/split'
import { followPdfLink } from '@/components/pdf/pdf-reader'
import { quoted } from '../../../../main/clip'

/**
 * The Feed: the day's twenty or so of your own things, as posts in a
 * timeline. Each post's account is where it came from: a quote's author, or
 * you. It ends: once you reach the bottom you are caught up until tomorrow.
 * A post opens on its own (its date, or its replies) as a thread of every
 * thought you kept on it.
 */
const readFeed = (): Promise<Feed> => call<Feed>('feed')
const NO_FEED = unread<Feed>({ day: '', posts: [], safe: false })
const readGoal = (): Promise<{ notes: number; quotes: number } | null> => call('feed:goal')
/**
 * What the Feed needs before it starts: enough that a day's set (about 24)
 * comes from a real spread of your own things, with a few quotes or pictures
 * among them so it is not a wall of your own words.
 */
const FEED_NOTES = 20
const FEED_QUOTES = 3
/** The made-up posts under the Feed's goal, drawn as real ones are. */
const SAMPLE_POSTS: FeedPost[] = ([
  { type: 'capture', kind: 'quote', title: 'There is no spoon.', text: 'There is no spoon.', who: 'The Matrix (1999)', days: 400 },
  { type: 'nugget', kind: 'note', title: 'Old movies feel real because the sets were real', text: 'Painted backdrops, real rain, real dust. You can feel the weight of a place that was built, not drawn.', who: null, days: 40 },
  { type: 'question', kind: 'question', title: 'Why does a story told out of order feel truer?', text: 'Memento, Pulp Fiction, Arrival: each one makes you put it together yourself.', who: null, days: 12 },
  { type: 'capture', kind: 'quote', title: 'It is not down on any map; true places never are.', text: 'It is not down on any map; true places never are.', who: 'Herman Melville', days: 90 }
] as const).map((one, at) => ({
  type: one.type, id: `sample-${at}`, kind: one.kind, title: one.title, text: one.text, who: one.who, made: new Date(Date.now() - one.days * 86_400_000).toISOString(),
  seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, liked: 0, tags: [], restack: null
}))
const react = (post: FeedPost, reaction: Reaction | null): Promise<Reaction | null> => call<Reaction | null>('feed:react', `${post.type}:${post.id}`, reaction)

const KIND_WORD: Record<FeedPost['type'], string> = { nugget: 'Gem', capture: 'Note', article: 'Page', question: 'Question', day: 'Journal', poll: 'Poll', quiz: 'Quiz card', pair: 'Thread' }
export const kindWord = (post: { kind: string; type: FeedPost['type'] }): string => (post.kind === 'quote' ? 'Quote' : KIND_WORD[post.type])

/** A date: "4 Mar", with the year once it is not this year's, or always (`years`) in a thread that spans years. */
export const written = (at: string, years = false): string => {
  const when = dayjs(at)
  return when.format(!years && when.year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')
}

/** The line over a post, when there is one: one you restacked, or one from long ago. */
const contextOf = (post: FeedPost): string => {
  if (post.restack) return 'You said it again'
  // Kept long ago and linked to nothing: opened, an @ in it links it.
  if (post.unlinked) return `From the archives: you kept this ${num(post.unlinked)} months ago and never linked it.`
  // Brought in by an importer: from your archives, whatever its date says (a note, only with the Settings switch).
  if (post.archive) return post.type === 'capture' && post.kind !== 'quote' ? `From the archives: ${PICTURES_SWITCH}` : 'From the archives'
  // A thought added lately is hearing from it: only what has been quiet a year is from the archives.
  const last = [post.seen, post.gloss?.at, post.made].filter((one): one is string => !!one).sort().at(-1)!
  const made = dayjs(post.made)
  if (made.format('MM-DD') === dayjs().format('MM-DD') && made.year() < dayjs().year()) return dayjs().year() - made.year() === 1 ? 'A year ago today' : `${dayjs().year() - made.year()} years ago today`
  if (dayjs().diff(dayjs(last), 'day') >= 365) return 'From the archives'
  return whyHere(post)
}

/**
 * Why a post is in the Feed at all, in plain words, said over every post that has no other line: what you kept it as,
 * and how long it has been away ("A quote you kept, back after 3 weeks"). A note that came only because of a Settings
 * switch says where that switch is.
 */
const PICTURES_SWITCH = 'Settings › Hints and cards'
export const whyHere = (post: Pick<FeedPost, 'type' | 'kind' | 'seen' | 'archive'>): string => {
  const what = post.kind === 'quote' ? 'A quote you kept'
    : post.type === 'nugget' ? 'A gem you kept'
    : post.type === 'question' ? 'A question you hold'
    : post.type === 'day' ? 'A Journal day'
    : post.type === 'article' ? 'A page of yours'
    : null
  if (!what) return `${post.archive ? 'A note you brought in' : 'A note with a picture'}: ${PICTURES_SWITCH}`
  return `${what}, ${post.seen ? `back after ${quietFor(post.seen)}` : 'its first time in your Feed'}`
}

/** Your own history with it, where it says something: "3 replies over 2 years", "seen 4 times". */
const repliesSaid = (post: FeedPost): string | null => {
  // One reply is the line hanging off the post already; "Show all" from two.
  if (post.replies < 2) return null
  const n = `All ${num(post.replies)} thoughts`
  if (!post.firstReply) return n
  const years = dayjs().year() - dayjs(post.firstReply).year() + 1
  const months = dayjs().diff(dayjs(post.firstReply), 'month')
  return years > 1 ? `${n} · over ${years} years` : months >= 2 ? `${n} · over ${months} months` : n
}

/** A post's place in the day's list, and whether the J/K cursor is on it. */
type Mark = { at: number; cursor: boolean; onPoint: () => void }
/** The cursor's ring round a post: drawn behind it and out past its edges, so nothing in the post moves. */
const CursorRing = ({ on }: { on: boolean }): React.JSX.Element | null =>
  on ? <span aria-hidden data-feed-cursor className="pointer-events-none absolute inset-y-0 -inset-x-3 -z-10 rounded-lg bg-accent/30 ring-1 ring-foreground/10" /> : null
/** What ⌘Z takes back in the Feed: the last quiz card graded, as Review's ⌘Z takes back its last grade. */
const quizUndo: { current: (() => void) | null } = { current: null }

/** Each post's picture's width over its height, once seen. */
const SHAPES = new Map<string, number>()

const REACTIONS: { value: Reaction; label: string; tip: string; icon: typeof Heart; cue: Cue; said: string }[] = [
  { value: 'like', label: 'Like', tip: 'Like: more of this, it comes back sooner', icon: Heart, cue: 'promote', said: 'You liked it today' },
  { value: 'changed', label: 'Changed my mind', tip: 'Changed my mind: write what you think now, under it', icon: RefreshCcw, cue: 'shift', said: 'You changed your mind on it today' },
  { value: 'use', label: 'Use this', tip: "Use this: puts a link to it on today's Journal page", icon: CornerDownRight, cue: 'added', said: "On today's Journal page" },
  { value: 'less', label: 'Less of this', tip: 'Less of this: it comes up less often', icon: EyeOff, cue: 'away', said: 'You will see this less often' }
]

/** What the row's first two say they are for, in a newcomer's words (Reading's foot bar says the same). */
/** How "Changed my mind" starts the note said again. */
const MIND = 'I used to think this. Now: '
export const THOUGHT_TIP = 'Add a thought: a dated line kept under this note, shown with it when it comes back'
export const AGAIN_TIP = 'Put it in your own words today: saying it again is how it sticks. Yours comes first tomorrow, this one quoted under it.'

/** How often "Less of this" has faded it, in words: "once", "twice", "3 times". */
const timesSaid = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${num(n)} times`)
/** "Show as before": every fade taken back, with Undo. */
const showAsBefore = (type: string, id: string): void => {
  chime('on')
  void call<number | null>('feed:unfade', type, id).then((was) => {
    if (was == null) return
    toast('It comes up as often as before', () => void call('feed:refade', type, id, was).then(() => chime('undo')), 'success')
  })
}
/** A note's own details: how far it has faded, and the way back. */
export function FadedLine({ type, id, className }: { type: string; id: string; className?: string }): React.JSX.Element | null {
  const faded = useLive(() => call<number>('feed:faded', type, id), 0, [type, id], ['capture', 'item'])
  if (!faded) return null
  return (
    <p data-faded-line className={cn('flex flex-wrap items-baseline gap-x-1.5 text-control text-muted-foreground', className)}>
      <span>Shown less often ({timesSaid(faded)})</span>
      <span aria-hidden>·</span>
      <button type="button" data-show-as-before onClick={() => showAsBefore(type, id)} className="rounded-sm text-foreground underline-offset-2 hover:underline">Show as before</button>
    </p>
  )
}

/** Time until tomorrow's set, in words: "9 hours 12 minutes". */
function useUntilTomorrow(): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [])
  const minutes = Math.max(1, dayjs(now).endOf('day').diff(dayjs(now), 'minute') + 1)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours && `${plural(hours, 'hour')}`, rest && `${plural(rest, 'minute')}`].filter(Boolean).join(' ')
}

/** The nearest box that scrolls, so a thread opened and closed comes back to the same place. */
const scrollerOf = (node: HTMLElement | null): HTMLElement | null => {
  for (let at = node?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at
  return null
}

/** Which tab the Feed was left on, for the next time it opens. */
const TAB = 'feedTab'
type FeedTab = 'notes' | 'reading' | 'liked'
const FEED_TABS: { value: FeedTab; label: string }[] = [{ value: 'notes', label: 'Notes' }, { value: 'reading', label: 'Reading' }, { value: 'liked', label: 'Liked' }]
const keptTab = (): FeedTab => {
  try {
    const kept = localStorage.getItem(TAB)
    return kept === 'reading' || kept === 'liked' ? kept : 'notes'
  } catch {
    return 'notes'
  }
}

/** The app's tab chips (tab-chips.tsx), kept here for those that import them from the Feed. */
export { TabChips }

const FINISHED = 'feedFinished'
/** Set once the action row has been explained under a first post. */
const EXPLAINED = 'feedRowExplained'
/** The day whose Feed you read to its end, for Home's card. */
const feedFinished = (): string | null => {
  try {
    return localStorage.getItem(FINISHED)
  } catch {
    return null
  }
}
const finishFeed = (day: string): void => {
  try {
    if (localStorage.getItem(FINISHED) === day) return
    localStorage.setItem(FINISHED, day)
  } catch {
    // Remembered for no longer than the card is on screen.
  }
  window.dispatchEvent(new CustomEvent('haligtree:feed-finished'))
}

/** Home's card for the day's Feed: how many posts, how many from the archives, and Open. Gone once you reach the end. */
export function TodaysFeedCard({ onView }: { onView: (id: string) => void }): React.JSX.Element | null {
  const feed = useLive(readFeed, NO_FEED, [], ['capture', 'item'], 'feed')
  // No card while the Feed is still its goal and a preview; the Feed page says it is ready, not Home.
  const goal = useLive(readGoal, null, [], ['capture', 'item'])
  const { real } = useReady('feed', goal ? goal.notes >= FEED_NOTES && goal.quotes >= FEED_QUOTES : null, false)
  const [finished, setFinished] = useState(feedFinished)
  useEffect(() => {
    const again = (): void => setFinished(feedFinished())
    window.addEventListener('haligtree:feed-finished', again)
    return () => window.removeEventListener('haligtree:feed-finished', again)
  }, [])
  if (unloaded(feed) || !real || feed.safe || !feed.posts.length || finished === feed.day) return null
  const archives = feed.posts.filter((post) => post.archive).length
  return (
    <section data-todays-feed aria-label="Today's feed" className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-heading font-semibold text-foreground">Today's feed</span>
        <span data-todays-feed-count className="text-body text-foreground/85">
          {num(feed.posts.length)} {feed.posts.length === 1 ? 'post' : 'posts'} today{archives ? `, ${num(archives)} from the archives` : ''}
        </span>
      </span>
      <button type="button" data-todays-feed-open onClick={() => (chime('page'), onView('feed'))}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-control font-medium text-foreground transition-colors hover:bg-foreground/[0.05]">
        Open <ArrowUpRight className="size-4" />
      </button>
    </section>
  )
}

/** Every way to Liked (the heart's menu, ⌘K) says so with this, and the Feed turns to it. */
export const showLiked = (): void => void window.dispatchEvent(new CustomEvent('haligtree:feed-liked'))

export function FeedView({ onOpen, focus }: { onOpen: (type: string, id: string) => void; /** ":liked" opens on Liked (⌘K). */ focus?: string }): React.JSX.Element {
  const [tab, setTab] = useState<FeedTab>(() => (focus === ':liked' ? 'liked' : keptTab()))
  useEffect(() => void (focus === ':liked' && setTab('liked')), [focus])
  useStepped(tab, setTab)
  useEffect(() => {
    const liked = (): void => setTab('liked')
    window.addEventListener('haligtree:feed-liked', liked)
    return () => window.removeEventListener('haligtree:feed-liked', liked)
  }, [])
  const choose = (next: FeedTab): void => {
    setTab(next)
    try {
      localStorage.setItem(TAB, next)
    } catch {
      // Remembered while the window is open.
    }
  }
  // Pages beside gems and notes, asked for here or in Settings; on the right, in the Notes tab only.
  const settings = useLive(haligtree.settings, null)
  const pages = settings?.feedPages === true
  // The tabs on the left of the page's top line, where Review, Stats and Goals keep theirs; the line's words
  // ("84 pages to read") and the tab's own switch on its right.
  const tabs = <TabChips name="feed" tabs={FEED_TABS} value={tab} onChange={choose} />
  const extra = tab === 'notes' && settings ? (
    // Set as the Inbox's "Show dealt with too" is: the switch, then its words, on a row that lights on hover.
    <label data-feed-pages className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-control whitespace-nowrap text-foreground/85 hover:bg-accent/60">
      <Switch checked={pages} onCheckedChange={(feedPages) => (chime(feedPages ? 'tick' : 'tap'), void haligtree.setSettings({ feedPages }))} />
      Pages too
      <MenuRows><DropdownMenuCheckboxItem checked={pages} onCheckedChange={(feedPages) => void haligtree.setSettings({ feedPages })} onSelect={(event) => event.preventDefault()}><FileText />Pages too</DropdownMenuCheckboxItem></MenuRows>
    </label>
  ) : undefined
  return <QueuedProvider>{tab === 'reading' ? <FeedReading tabs={tabs} onOpen={onOpen} /> : tab === 'liked' ? <FeedLiked tabs={tabs} onOpen={onOpen} /> : <FeedNotes tabs={tabs} extra={extra} onOpen={onOpen} pages={pages} />}</QueuedProvider>
}

function FeedNotes({ onOpen, tabs, extra, pages }: { onOpen: (type: string, id: string) => void; tabs: React.ReactNode; extra?: React.ReactNode; pages: boolean }): React.JSX.Element {
  // Read again when pages are let in or kept out.
  const feed = useLive(readFeed, NO_FEED, [pages], ['capture', 'item'], 'feed')
  // Until the book has enough in it, the goal and a faded made-up Feed; met once, the real one for good.
  const goal = useLive(readGoal, null, [], ['capture', 'item'])
  const { real, moment } = useReady('feed', goal ? goal.notes >= FEED_NOTES && goal.quotes >= FEED_QUOTES : null)
  const preview = real === false && !feed.safe
  const until = useUntilTomorrow()
  const root = useRef<HTMLDivElement>(null)
  const [thread, setThread] = useState<string | null>(null)
  // Where the post opened sat on screen, so back puts it there again.
  const place = useRef<{ key: string; top: number } | null>(null)
  const open = (type: string, id: string): void => (chime('open'), onOpen(type, id))
  const openThread = (post: FeedPost): void => {
    const scroller = scrollerOf(root.current)
    const node = root.current?.querySelector(`[data-feed-id="${CSS.escape(post.id)}"]`)
    place.current = scroller && node ? { key: post.id, top: node.getBoundingClientRect().top - scroller.getBoundingClientRect().top } : null
    chime('page')
    setThread(`${post.type}:${post.id}`)
  }
  const back = (): void => (chime('back'), setThread(null))
  // Back to the same place in the list, before it is drawn.
  // Held there for a moment too, while the pictures and replies above it draw in.
  useLayoutEffect(() => {
    const scroller = scrollerOf(root.current)
    if (!scroller) return
    if (thread || !place.current) return void jumpTo(scroller, 0)
    const { key, top } = place.current
    const put = (): void => {
      const node = root.current?.querySelector(`[data-feed-id="${CSS.escape(key)}"]`)
      if (node) jumpTo(scroller, scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - top)
    }
    put()
    // Held each frame while what is above it draws in (a picture loading late, full width, grows the list above
    // the post); let go once the list has kept its size a moment, or after 3 seconds at most.
    let frame = requestAnimationFrame(function again() { put(); frame = requestAnimationFrame(again) })
    let settled = 0
    const sizes = new ResizeObserver(() => (window.clearTimeout(settled), void (settled = window.setTimeout(stop, 500))))
    if (root.current) sizes.observe(root.current)
    const stop = (): void => (cancelAnimationFrame(frame), sizes.disconnect(), window.clearTimeout(settled))
    settled = window.setTimeout(stop, 500)
    const until = window.setTimeout(stop, 3000)
    // A hand on the page lets go at once.
    scroller.addEventListener('wheel', stop, { passive: true, once: true })
    scroller.addEventListener('pointerdown', stop, { once: true })
    return () => (stop(), window.clearTimeout(until), scroller.removeEventListener('wheel', stop), scroller.removeEventListener('pointerdown', stop))
  }, [thread])
  // Reached the end: the day's Feed is finished, and Home's card for it goes.
  const endRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const end = endRef.current
    if (!end || !feed.day) return
    const watch = new IntersectionObserver(([one]) => one?.isIntersecting && finishFeed(feed.day))
    watch.observe(end)
    return () => watch.disconnect()
  })
  const shown = thread ? feed.posts.find((post) => `${post.type}:${post.id}` === thread) : undefined
  const counts = feed.posts.reduce<Record<string, number>>((all, post) => ({ ...all, [kindWord(post)]: (all[kindWord(post)] ?? 0) + 1 }), {})
  // The line says what the day holds, the three kinds it has most of: "8 gems, 5 quotes, 4 notes and 7 more".
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top = most.slice(0, 3).map(([word, n]) => `${num(n)} ${word === 'Journal' ? (n === 1 ? 'Journal day' : 'Journal days') : n === 1 ? word.toLowerCase() : `${word.toLowerCase()}s`}`)
  const rest = most.slice(3).reduce((sum, [, n]) => sum + n, 0)
  const listed = rest ? `${top.join(', ')} and ${num(rest)} more` : top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top.at(-1)}` : (top[0] ?? '')
  const holds = feed.posts.length && !feed.safe && !preview ? listed : null
  // Search, as Writing's and the Inbox's lists have it (ListSearch): the posts that hold every word typed, in their
  // words, who said them, their tags and your thoughts on them; the rest step out, and the line says how many are left.
  const [query, setQuery] = useState('')
  const searching = !!query.trim() && !thread
  const posts = searching ? feed.posts.filter((post) => matches([post.title, post.text, post.who ?? '', post.tags.join(' '), post.gloss?.body ?? ''].join(' '), query)) : feed.posts
  // J and K move a cursor between posts, L likes, R replies, Enter opens; on a quiz card, Space shows the answer and 1 to 4 grade it, as in Review.
  const [cursor, setCursor] = useState(-1)
  // The first time the row is met, one line under the first post says what it is for; never again after.
  const [explain] = useState(() => {
    try {
      return !localStorage.getItem(EXPLAINED)
    } catch {
      return false
    }
  })
  const plain = preview || feed.safe ? -1 : posts.findIndex((post) => !post.poll && !post.quiz)
  useEffect(() => {
    if (!explain || plain < 0) return
    try {
      localStorage.setItem(EXPLAINED, '1')
    } catch {
      // Said again next time.
    }
  }, [explain, plain])
  const here = useHere()
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (thread || !here() || !posts.length || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const by = event.code === 'KeyJ' || event.key === 'ArrowDown' ? 1 : event.code === 'KeyK' || event.key === 'ArrowUp' ? -1 : 0
      if (by) {
        event.preventDefault()
        const next = Math.max(0, Math.min(posts.length - 1, cursor + by))
        setCursor(next)
        root.current?.querySelector(`[data-feed-at="${next}"]`)?.scrollIntoView({ block: 'nearest' })
        return
      }
      const post = posts[cursor]
      const node = root.current?.querySelector<HTMLElement>(`[data-feed-at="${cursor}"]`)
      if (!post || !node) return
      const press = (what: string): void => (event.preventDefault(), node.querySelector<HTMLElement>(what)?.click())
      if (post.quiz) {
        if (event.key === ' ') press('[data-feed-quiz-show]')
        else if (['1', '2', '3', '4'].includes(event.key)) press(`[data-feed-grade="${event.key}"]`)
        else if (event.key === 'Enter' && !(event.target as HTMLElement | null)?.closest?.('button, a, [role="link"]')) (event.preventDefault(), open('nugget', post.id))
        return
      }
      if (post.poll || post.pair) return
      // ⌫: the post's note to the Bin, with the Undo "Move to the Bin" gives; the cursor stays where it was, on the next one.
      if ((event.key === 'Backspace' || event.key === 'Delete') && post.type !== 'day') return void (event.preventDefault(), node.dispatchEvent(new Event('haligtree:feed-bin')))
      if (event.code === 'KeyL') press('[data-feed-reaction="like"]')
      else if (event.code === 'KeyR') (event.preventDefault(), openGloss(post.id))
      else if (event.key === 'Enter' && !(event.target as HTMLElement | null)?.closest?.('button, a, [role="link"]')) (event.preventDefault(), open(post.type, post.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // ⌘Z: the last quiz card graded here taken back, as Review's ⌘Z takes back its last grade.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.shiftKey || event.key !== 'z' || typing() || !here() || !quizUndo.current) return
      event.preventDefault()
      event.stopPropagation()
      const undo = quizUndo.current
      quizUndo.current = null
      undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  return (
    <Page title="Feed" waiting={unloaded(feed) || real === null} lead={tabs} actions={extra} search={holds ? (
      <span className="flex min-w-0 items-center gap-3">
        <ListSearch value={query} onChange={(words) => (setQuery(words), setCursor(-1))} onDone={() => setCursor(0)} placeholder="Search today's Feed"
          onStep={(by) => { const next = Math.max(0, Math.min(posts.length - 1, cursor + by)); setCursor(next); root.current?.querySelector(`[data-feed-at="${next}"]`)?.scrollIntoView({ block: 'nearest' }) }} />
        <FeedSaid data-feed-holds>{searching ? `${num(posts.length)} of ${plural(feed.posts.length, 'post')}` : holds}</FeedSaid>
      </span>
    ) : undefined}>
      {/* A narrow column of posts with the side column beside it, as a social feed. */}
      <FeedColumns side={!feed.safe && !preview && feed.posts.length > 0 ? <SideColumn onOpen={onOpen} /> : null}>
      <div ref={root} data-feed className="flex min-w-0 flex-col px-5 pt-4 pb-16">
        {shown ? (
          <Thread post={shown} onBack={back} onOpen={() => open(shown.type, shown.id)} onOpenOther={open} />
        ) : feed.safe ? (
          <p data-feed-safe className="py-10 text-body text-foreground"><strong className="font-semibold">Safe mode is on</strong>, so the Feed rests until you turn it off.</p>
        ) : preview ? (
          <GoalPreview goal="Your Feed starts once you have 20 notes, with a few quotes or pictures among them" heading="What your Feed will look like"
            counts="To get there, pick out a line as a gem or a question, keep a quote, or add a picture to a note. Journal days count once they are a week old. Private notes and #bits never do."
            parts={[{ have: goal?.notes ?? 0, need: FEED_NOTES, what: 'notes' }, { have: goal?.quotes ?? 0, need: FEED_QUOTES, what: 'quotes or pictures' }]}>
            <ol className="flex flex-col">{SAMPLE_POSTS.map((post) => <Post key={post.id} post={post} preview onOpen={() => {}} onOpenOther={() => {}} />)}</ol>
          </GoalPreview>
        ) : !feed.posts.length ? (
          <p data-feed-empty className="py-10 text-body text-foreground">Nothing to show yet. Keep a gem, a quote or a question, and it comes back to you here.</p>
        ) : (
          <>
            {moment && <ReadyMoment said="Your Feed is ready" more="Each day it brings back about twenty of your own things, longest unseen first. A new set comes every morning." />}
            {searching && !posts.length && (
              <p data-feed-none className="py-10 text-body text-foreground">
                <strong className="font-semibold">Nothing in today's Feed has “{query.trim()}”.</strong>{' '}
                <button type="button" data-feed-search-all className="cursor-pointer text-(--mf-muted-strong) underline decoration-foreground/25 underline-offset-2 hover:text-foreground"
                  onClick={() => (chime('open'), window.dispatchEvent(new CustomEvent('haligtree:search', { detail: { words: query.trim() } })))}>Search your whole book for it</button>
              </p>
            )}
            <ol className="flex flex-col">
              {posts.map((post, at) => {
                const mark = { at, cursor: at === cursor, onPoint: () => startTransition(() => setCursor(at)) }
                return post.pair ? <PairPost key={`pair:${post.id}`} post={post} mark={mark} onOpen={open} />
                  : post.poll ? <PollPost key={`poll:${post.id}`} post={post} mark={mark} onOpen={() => open(post.poll!.open.type, post.poll!.open.id)} />
                  : post.quiz ? <QuizPost key={`quiz:${post.id}`} post={post} mark={mark} onOpen={() => open('nugget', post.id)} />
                  : <Post key={`${post.type}:${post.id}`} post={post} mark={mark} onOpen={() => open(post.type, post.id)} onOpenOther={open} onThread={() => openThread(post)} explain={explain && at === plain} />
              })}
            </ol>
            {!searching && <footer ref={endRef} data-feed-end className="flex flex-col items-center gap-1.5 py-12 text-center">
              <p className="text-lead font-semibold tracking-[-0.01em] text-foreground">You're all caught up</p>
              <p data-feed-summary className="max-w-[44ch] text-body text-foreground/85">{listed} came up today.</p>
              <p data-feed-next className="text-body text-muted-foreground">A new set in {until}.</p>
            </footer>}
          </>
        )}
      </div>
      </FeedColumns>
    </Page>
  )
}

/** One post on its own, its thoughts below it as a thread, oldest first, and a reply box at the foot. */
function Thread({ post, onBack, onOpen, onOpenOther }: { post: FeedPost; onBack: () => void; onOpen: () => void; onOpenOther: (type: string, id: string) => void }): React.JSX.Element {
  const glosses = useLive(() => haligtree.glosses(post.id), [] as Gloss[], [post.id])
  const thread = [...glosses].reverse()
  // Every date says its year once the thread runs over more than this one.
  const years = [post.made, ...thread.map((one) => one.createdAt)].some((at) => dayjs(at).year() !== dayjs().year())
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')
      if (event.key === 'Escape' && !typing && !document.querySelector('[role="dialog"], [role="menu"]')) (event.preventDefault(), event.stopPropagation(), onBack())
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onBack])
  return (
    <section data-feed-thread className="flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Tip label="Back to the Feed (Esc)">
          <button type="button" data-feed-back onClick={onBack} className="-ml-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
            <ArrowLeft className="size-[18px]" />
          </button>
        </Tip>
        <p className="text-reading font-semibold text-foreground">Post</p>
      </div>
      <ol className="flex flex-col">
        <Post post={post} onOpen={onOpen} onOpenOther={onOpenOther} alone joined={thread.length > 0} />
        {thread.map((gloss, at) => (
          <li key={gloss.id} data-feed-gloss className="flex gap-3">
            <div className="flex w-9 shrink-0 flex-col items-center">
              <Avatar name={gloss.author === 'ai' ? 'AI' : 'You'} size={28} className="mt-1 shrink-0" />
              {at < thread.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
              <p className="flex items-baseline gap-1.5 text-control">
                <span className="font-semibold text-foreground">{gloss.author === 'ai' ? 'Written by AI' : 'You'}</span>
                <span aria-hidden className="text-muted-foreground">·</span>
                <time data-feed-gloss-at dateTime={gloss.createdAt} className="text-muted-foreground tabular-nums">{written(gloss.createdAt, years)}</time>
              </p>
              <p className="text-body leading-relaxed whitespace-pre-line hyphens-auto [overflow-wrap:break-word] text-foreground/90 private-text">{gloss.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t pt-3 pl-12">
        {!unloaded(glosses) && <GlossLine id={post.id} latest={false} open={!thread.length} placeholder="Your thought, in your own words" />}
      </div>
    </section>
  )
}

export function Post({ post, onOpen, onOpenOther, onThread, alone = false, joined = false, preview = false, likedLine, onUnlike, mark, explain = false }: {
  post: FeedPost
  /** The first post the first time: one line under its row says what the row is for. */
  explain?: boolean
  /** In Notes: its place, and the J/K cursor. */
  mark?: Mark
  onOpen: () => void
  onOpenOther: (type: string, id: string) => void
  onThread?: () => void
  /** On its own page, with its thread below. */
  alone?: boolean
  /** Only how it will look: no controls, as quick capture shows it before it is kept. */
  preview?: boolean
  /** A thread follows, so a line runs down from its picture. */
  joined?: boolean
  /** In Liked: when you liked it, said first under it ("Liked 3 days ago"). */
  likedLine?: string
  /** In Liked: the heart takes it out of the list, with Undo. */
  onUnlike?: () => void
}): React.JSX.Element | null {
  const quote = post.kind === 'quote'
  const account = (quote && post.who) || 'You'
  // In Liked, nothing over a post says it is old or unwanted: the like is what it is there for.
  const context = onUnlike ? null : contextOf(post)
  const thumb = useThumb(post.type === 'day' ? '' : post.id)
  const picture = thumb && !/\.(mp4|m4v|mov|webm)$/i.test(thumb) ? thumb : undefined
  const [broken, setBroken] = useState(false)
  // Its width over its height, once loaded: it fills the post's width unless that would make it taller than 720px.
  // Kept per picture, so a post drawn again (back from a thread) has its height at once and nothing below it moves.
  const [kept, setShapeNow] = useState<number | null>(() => SHAPES.get(post.id) ?? null)
  const setShape = (value: number | null): void => (value && SHAPES.set(post.id, value), setShapeNow(value))
  // Decoded before the Feed is first drawn, a moment at most: its shape known, so it is there at its size in the first frame.
  const decoded = useDecoded(picture, !thumbsRead())
  const shape = kept ?? decoded.shape
  // What you chose shows at once; the Feed's next read says the same.
  const [chosen, setChosen] = useState<Reaction | null>(post.react)
  useEffect(() => setChosen(post.react), [post.react])
  const [restacking, setRestacking] = useState(false)
  // Opened by "Changed my mind": the same composer, already started, and the old note marked once it is kept.
  const [mind, setMind] = useState(false)
  const [binned, setBinned] = useState(false)
  const self = useRef<HTMLLIElement>(null)
  // A quote's link back is said once, on its own line under it, not again at the foot of its words.
  const words = quote ? (post.from ? (post.text || post.title).split('\n').filter((line) => line.trim().replace(/, p\. \d+$/, '') !== post.from!.name).join('\n') : post.text || post.title) : post.text
  const link = post.type === 'capture' ? post.id : `${post.type === 'question' ? 'nugget' : post.type}:${post.id}`
  // What is not worth a glance on every post waits in ⋯: the reactions after "Still true", then Open and Copy link.
  const reaction = (value: Reaction): MenuItem => {
    const one = REACTIONS.find((it) => it.value === value)!
    return { id: value, label: one.label, hint: one.tip, icon: <one.icon className="size-4" />, trail: chosen === value ? <Check className="ml-auto size-4 text-primary" /> : undefined, run: () => choose(value) }
  }
  // The note behind it to the Bin: the post goes at once, and Undo (⌘Z too) brings both back. From ⋯, the × and ⌫.
  const toBin = (): void => {
    setBinned(true)
    void moveToBin([{ type: post.type, id: post.id }], () => setBinned(false)).then((n) => n || setBinned(false))
  }
  const binItem: MenuItem = { id: 'bin', label: 'Move to the Bin', danger: true, icon: <Trash2 className="size-4" />, run: toBin }
  useEffect(() => {
    const node = self.current
    if (!node || post.type === 'day' || preview) return
    node.addEventListener('haligtree:feed-bin', toBin)
    return () => node.removeEventListener('haligtree:feed-bin', toBin)
  })
  const menu: MenuItem[] = [
    // Said again, started for you: the new note comes first tomorrow, and this one points to it from now on.
    post.type !== 'day' && { id: 'changed', label: 'Changed my mind', icon: <RefreshCcw className="size-4" />, run: () => (chime('tap'), setMind(true), setRestacking(true)) },
    reaction('use'),
    post.type !== 'day' && reaction('less'),
    'separator',
    { id: 'open', label: 'Open', icon: <ArrowUpRight className="size-4" />, run: onOpen },
    copyLinkItem(link, post.type === 'day' ? dayLinkName(post.id) : post.title),
    // The heart's right-click menu's way to Liked, here too, where it can be found.
    !onUnlike && { id: 'see-liked', label: 'See everything you liked', hint: 'Liked, in the Feed', icon: <Heart className="size-4" />, run: () => (chime('page'), showLiked()) },
    // The Feed never shows a private note, so every post here may be a picture.
    'separator',
    { id: 'save-image', label: 'Save as image', hint: 'A picture of this post, in the current theme', icon: <ImageDown className="size-4" />, run: () => void saveImage() },
    { id: 'share-x', label: 'Share to X', hint: 'Its words in X, its picture copied to paste in', icon: <Share className="size-4" />, run: () => void shareX() },
    // Housekeeping last: the note, gem, question or writing behind it to the Bin, the post gone at once and back with Undo. A day is not a thing to bin.
    post.type !== 'day' && 'separator',
    post.type !== 'day' && binItem
  ]
  const cardOf = (): CardPost => ({ account, said: `${kindWord(post)} · ${written(post.made, true)}`, title, text: quote ? words : text, quote, who: post.who, picture: broken ? undefined : picture })
  const saveImage = async (): Promise<void> => {
    const data = await drawCard(cardOf(), self.current)
    if (await call<boolean>('feed:save-image', title, data)) (chime('saved'), toast('Saved as a picture'))
  }
  const shareX = async (): Promise<void> => {
    const card = cardOf()
    const data = await drawCard(card, self.current)
    await call('feed:share-x', xText(card), data)
    chime('send')
    toast('Text in X; the picture is copied, paste it in')
  }
  const title = post.type === 'day' ? dayjs(post.id).format(dayjs(post.id).year() === dayjs().year() ? 'dddd D MMMM' : 'dddd D MMMM YYYY') : splitTags(post.title).text || post.title
  // A restack's link to the old note is said by the card under it, not twice.
  const text = post.restack ? post.text.split('\n').filter((line) => line.trim() !== post.restack!.title.replace(/\s+/g, ' ').trim().slice(0, 80)).join('\n') : post.text

  const openWho = (): void => void (post.who && (chime('page'), openSource('attribution', post.who)))
  const choose = (reaction: Reaction): void => {
    const next = chosen === reaction ? null : reaction
    const was = chosen
    const option = REACTIONS.find((one) => one.value === reaction)!
    chime(next ? option.cue : 'undo')
    setChosen(next)
    const undo = (): void => (chime('undo'), setChosen(was), void react(post, was))
    void react(post, next).then(() => {
      if (next === 'use') toast("Put on today's Journal page, as a link", undo, 'success')
      else if (next === 'less') toast('This comes up less often now', undo, 'success')
      else quietly(undo)
    })
    // After the ⋯ menu has shut and handed focus back, so the field keeps the caret.
    if (next === 'changed') window.setTimeout(() => openGloss(post.id), 80)
  }

  const history = [
    likedLine ?? (chosen && chosen !== 'less' && REACTIONS.find((one) => one.value === chosen)!.said),
    // Its likes over time, never anyone else's: today's counts at once.
    Math.max(post.liked, chosen === 'like' ? 1 : 0) >= 2 && `liked ${num(Math.max(post.liked, chosen === 'like' ? 1 : 0))} times`,
    post.seenTimes >= 2 && `came back to you ${timesSaid(post.seenTimes)}`
  ].filter(Boolean) as string[]
  const replies = repliesSaid(post)
  // The newest thought on it, hung under the post (not on its own page, where the thread is).
  const glosses = useLive(() => (alone || preview ? Promise.resolve([] as Gloss[]) : haligtree.glosses(post.id)), [] as Gloss[], [post.id, alone, preview])
  const hang = onThread && !unloaded(glosses) ? glosses[0] : undefined
  // Faded by "Less of this", today or before: how far, and the way back. Today's choice counts at once.
  const faded = Math.max(post.faded, chosen === 'less' ? 1 : 0)
  if (binned) return null

  return (
    // Carried to the window's side, it opens beside the Feed (split-drop.tsx).
    <li ref={self} data-feed-at={mark?.at} onPointerDown={mark?.onPoint} data-drag-open={preview ? undefined : `${post.type}:${post.id}`} data-drag-title={title} data-look-group data-feed-post={post.type} data-feed-id={post.id} data-feed-archive={post.archive || undefined} data-feed-kind={post.kind} data-feed-react={chosen ?? undefined}
      className={cn('relative isolate flex flex-col gap-1 py-4 first:pt-0', !alone && 'border-b last:border-b-0', alone && joined && 'pb-3')} data-set-aside={chosen === 'less' ? '' : undefined}>
      <CursorRing on={!!mark?.cursor} />
      {context && <p data-feed-context className="flex items-center gap-1.5 pl-12 text-control text-muted-foreground">{post.restack && <Repeat2 className="size-3.5" />}{context}
        {post.unlinked && !preview && <button type="button" data-feed-unlinked onClick={onOpen} className="rounded-sm font-medium text-primary underline-offset-2 hover:underline">Open it</button>}</p>}
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center">
          {quote && post.who ? (
            <button type="button" aria-label={`Open ${post.who}'s page`} onClick={openWho} className="mt-0.5 shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring"><Avatar name={account} size={36} /></button>
          ) : <Avatar name={account} size={36} className="mt-0.5 shrink-0" />}
          {(joined || hang) && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 items-baseline gap-1.5 text-control">
            {quote && post.who ? (
              <button type="button" {...hoverNote('person', post.who)} data-feed-account data-feed-source onClick={openWho} className="truncate rounded-sm font-semibold text-foreground hover:underline">{account}</button>
            ) : <span data-feed-account className="truncate font-semibold text-foreground">{account}</span>}
            <span className="shrink-0 text-muted-foreground">{kindWord(post)}</span>
            <span aria-hidden className="shrink-0 text-muted-foreground">·</span>
            {onThread ? (
              <button type="button" data-feed-date onClick={onThread} className="shrink-0 rounded-sm text-muted-foreground tabular-nums hover:text-foreground hover:underline">
                <time dateTime={post.made}>{written(post.made)}</time>
              </button>
            ) : (
              <time dateTime={post.made} className="shrink-0 text-muted-foreground tabular-nums">{written(post.made)}</time>
            )}
            {/* Less of this, as X and Substack hide a post: a quiet × at its top right, held in the line's height. */}
            {post.type !== 'day' && !preview && !onUnlike && (
              <span data-feed-hide aria-pressed={chosen === 'less'} className={cn('-my-1.5 -mr-1.5 ml-auto flex shrink-0 self-center', chosen === 'less' && '[&>button]:text-primary')}>
                <MenuButton small name="hide" label="Less of this, or the Bin" icon={<X className="size-4" />} items={[reaction('less'), binItem]} />
              </span>
            )}
          </p>
          {quote ? (
            // The quote is its own way in: a click anywhere on it opens the note it is, as a title does.
            <figure data-feed-quote role="link" tabIndex={0} aria-label={`Open the quote${post.who ? ` by ${post.who}` : ''}`}
              onClick={(event) => !(event.target as HTMLElement).closest('a, button') && window.getSelection()?.isCollapsed !== false && heroOpen(heroAround(event, 'li'), onOpen)}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onOpen())}
              className="cursor-pointer rounded-lg border bg-accent/25 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring">
              <blockquote className="font-serif text-reading whitespace-pre-line hyphens-auto [overflow-wrap:break-word] text-foreground line-clamp-[10]"><Linked text={words} links={post.links} onOpen={onOpenOther} /></blockquote>
              {post.who && <figcaption data-feed-author className="mt-2 text-control font-medium text-(--mf-muted-strong)"><span {...hoverNote('person', post.who)}>{post.who}</span></figcaption>}
              {/* The page or PDF it came from, at its page: one click opens it there. */}
              {post.from && (
                <button type="button" data-feed-from={post.from.href} data-feed-from-page={post.from.page ?? undefined} onClick={() => (chime('open'), followPdfLink(post.from!.href))}
                  className="mt-1.5 flex max-w-full items-center gap-1.5 rounded-sm text-control text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{post.from.name}</span>
                  {post.from.page && <span className="shrink-0 whitespace-nowrap tabular-nums">· p. {num(post.from.page)}</span>}
                </button>
              )}
            </figure>
          ) : (
            <>
              <button type="button" data-feed-title onClick={(event) => heroOpen(heroAround(event, 'li'), onOpen)} className="w-fit rounded-sm text-left text-body font-semibold hyphens-auto [overflow-wrap:break-word] text-foreground underline-offset-2 hover:underline">{title}</button>
              {post.type !== 'question' && text && <p className="line-clamp-[8] text-body leading-relaxed whitespace-pre-line hyphens-auto [overflow-wrap:break-word] text-foreground/90"><Linked text={text} links={post.links} onOpen={onOpenOther} /></p>}
            </>
          )}
          {post.tags.length > 0 && (
            <p data-feed-tags className="flex flex-wrap gap-x-2 text-control">
              {post.tags.map((tag) => <button key={tag} type="button" data-feed-tag={tag} {...hoverNote('tag', tag)} onClick={(event) => (chime('page'), openTag(tag, event.altKey))} className="rounded-sm text-muted-foreground hover:text-foreground hover:underline">#{tag}</button>)}
            </p>
          )}
          {post.changedTo && !preview && <ChangedLink to={post.changedTo} onOpen={(id) => onOpenOther('nugget', id)} />}
          {post.restack && <Quoted note={post.restack} onOpen={() => onOpenOther(post.restack!.type, post.restack!.id)} />}
          {/* Its picture still on its way, drawn before: its room kept, so the posts below never move. */}
          {!picture && shape && !broken && <div aria-hidden data-feed-picture-room className="mt-1 max-w-full rounded-xl border bg-accent/40" style={{ width: `min(100%, ${Math.round(720 * shape)}px)`, aspectRatio: String(shape) }} />}
          {picture && !broken && (
            // The whole picture at its own shape, never cropped and never boxed in bars: the full width of the post
            // (a square one too); only one so tall it would run past 720px stands at that height, as wide as it then is.
            // Clicked, it opens in the viewer as a picture in a note does; Esc puts it back.
            <button type="button" data-feed-picture aria-label="Look at the picture" onClick={(event) => lookAtPicture(event.currentTarget.querySelector('img'))}
              className={cn('mt-1 block max-w-full overflow-hidden rounded-xl border bg-accent/40', LOOKABLE)} style={{ width: shape ? `min(100%, ${Math.round(720 * shape)}px)` : '100%' }}>
              <img data-look src={picture} alt="" decoding="async" draggable={false} onError={() => setBroken(true)}
                onLoad={(event) => setShape(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || null)}
                className="block h-auto w-full" style={shape ? { aspectRatio: String(shape) } : undefined} />
            </button>
          )}
        </div>
      </div>
      {/* The latest thought hangs off the post on a bent line, the sidebar's Pinned tree's way; the rest are in its thread. */}
      {hang && (
        <div data-feed-hanging className="flex gap-3 pt-2.5 pb-2">
          {/* Down from the line under the picture, then bent toward the reply's first line. Laid out as that line is
              (a hair-wide strip centred in the same column) and measured in rem as the gaps are, so its corner meets
              the line and the words at every text size: fixed pixels drifted off both once the app was not at 100%. */}
          <div aria-hidden className="flex w-9 shrink-0 flex-col items-center">
            {/* Up through this row's top padding and the post's gap (0.625rem + 0.25rem), down to the middle of the first line (half of 1.125rem). */}
            <span data-feed-bend className="relative -mt-[0.875rem] h-[calc(1.4375rem+0.5px)] w-px">
              <span className="absolute top-0 bottom-[5px] left-0 w-px bg-border" />
              <svg className="absolute bottom-0 left-0 size-[6px] overflow-visible text-border" viewBox="0 0 6 6" fill="none">
                <path d="M0.5 0 Q0.5 5.5 6 5.5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
              <span data-feed-bend-end className="absolute bottom-0 left-[6px] h-px w-[calc(1.875rem-9.5px)] bg-border" />
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <button type="button" data-feed-latest onClick={onThread} {...hoverThought(post.id, hang.id, title)}
              className="group/hang line-clamp-2 min-w-0 rounded-sm text-left text-control text-foreground/85 hyphens-auto [overflow-wrap:break-word] hover:text-foreground">
              <span className="private-text group-hover/hang:underline">{cutWords(hang.body, 140)}</span>
              <span data-feed-latest-date className="text-meta whitespace-nowrap text-muted-foreground"> · {hang.author === 'ai' ? 'AI, ' : ''}{ago(hang.createdAt)}</span>
            </button>
            {replies && (
              <button type="button" data-feed-replies onClick={onThread} className="rounded-sm text-control text-muted-foreground hover:text-foreground hover:underline">{replies}</button>
            )}
            {/* A quote you last answered over a year ago, back again: asked once more, the new reply joining the same thread. */}
            {quote && hang.author !== 'ai' && dayjs().diff(dayjs(hang.createdAt), 'day') >= 365 && (
              <button type="button" data-feed-read-now onClick={() => (chime('tap'), openGloss(post.id))} className="rounded-sm text-control font-medium text-primary underline-offset-2 hover:underline">How does this read to you now?</button>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <div aria-hidden className="w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Writing a reply opens here, under the latest; closed, it takes no room. */}
          {!alone && !preview && <GlossLine id={post.id} quiet latest={false} className="mt-0.5" placeholder={chosen === 'changed' ? 'What you think now, in your own words' : 'Your thought, in your own words'} />}
          {/* Every control keeps its own fixed place: choosing one changes its colour, never the row. */}
          {/* On a narrow window (a phone's width) the three keep their icons and say their words in their tips. */}
          <div data-feed-actions className={cn('@container/actions -ml-2 flex items-center gap-1 whitespace-nowrap text-muted-foreground', preview && 'hidden')}>
            <Tip label={THOUGHT_TIP}>
              <button type="button" data-feed-reply aria-label="Add a thought" onClick={() => openGloss(post.id)}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <MessageCircle className="size-4 shrink-0" /> <span className="hidden @[26rem]/actions:inline">Add a thought</span>
              </button>
            </Tip>
            <Tip label={AGAIN_TIP}>
              <button type="button" data-feed-restack aria-label="Say it again" aria-pressed={restacking} onClick={() => (chime(restacking ? 'fold' : 'tap'), setMind(false), setRestacking(!restacking))}
                className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground', restacking && 'text-foreground')}>
                <Repeat2 className="size-4 shrink-0" /> <span className="hidden @[26rem]/actions:inline">Say it again</span>
              </button>
            </Tip>
            {post.type !== 'day' && post.type !== 'poll' && post.type !== 'quiz' && <ReadLaterLabelled id={post.id} wordsClassName="hidden @[26rem]/actions:grid" />}
            {/* The like, where the thumb looks for it (a Journal day too: liked, it comes back sooner); the rest are in ⋯. Chosen, it fills in red and nothing moves. */}
            {/* Right-clicked, the heart's own menu: like or unlike, and every post you liked. */}
            <RowMenu items={[{ id: 'like', label: chosen === 'like' ? 'Unlike' : 'Like', icon: <Heart className="size-4" />, run: () => (onUnlike ? onUnlike() : choose('like')) }, { id: 'see-liked', label: 'See everything you liked', hint: 'Liked, in the Feed', icon: <ArrowUpRight className="size-4" />, run: () => (chime('page'), showLiked()) }]}>
              <span className="flex">
                <Tip label={onUnlike ? 'Unlike: take it out of Liked' : REACTIONS[0].tip}>
                  <button type="button" data-feed-reaction="like" aria-pressed={chosen === 'like'} aria-label={onUnlike ? 'Unlike' : 'Like'} onClick={() => (onUnlike ? onUnlike() : choose('like'))}
                    className={cn('flex size-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground', chosen === 'like' && 'text-[var(--tt-color-text-red)] hover:text-[var(--tt-color-text-red)]')}>
                    <Heart className="size-4" fill={chosen === 'like' ? 'currentColor' : 'none'} />
                  </button>
                </Tip>
              </span>
            </RowMenu>
            <span className="flex-1" />
            <MenuButton small label="More" name="post" items={menu} />
          </div>
          {!preview && (history.length > 0 || faded > 0) && (
            <p data-feed-history className="flex flex-wrap items-baseline gap-x-1.5 text-control text-muted-foreground">
              {history.map((line, at) => (
                <span key={line} className="flex items-baseline gap-1.5">{at > 0 && <span aria-hidden>·</span>}{line}</span>
              ))}
              {faded > 0 && post.type !== 'day' && (
                <span data-feed-faded className="flex items-baseline gap-1.5">
                  {history.length > 0 && <span aria-hidden>·</span>}
                  Shown less often ({timesSaid(faded)})
                  <span aria-hidden>·</span>
                  <button type="button" data-show-as-before onClick={() => (setChosen(null), showAsBefore(post.type === 'question' ? 'nugget' : post.type, post.id))} className="rounded-sm text-foreground underline-offset-2 hover:underline">Show as before</button>
                </span>
              )}
            </p>
          )}
          {explain && (
            <p data-feed-explain className="text-control text-(--mf-muted-strong)">
              “Add a thought” keeps a dated line under it, “Say it again” puts it in your own words for tomorrow, and “Read later” keeps it in your Queue.
            </p>
          )}
          {restacking && <Restack post={post} mind={mind} initial={mind ? MIND : ''} onDone={() => (setRestacking(false), setMind(false))} onOpen={(id) => onOpenOther('nugget', id)} />}
        </div>
      </div>
    </li>
  )
}

/** A post's account line: you, what it is, and its date. */
function PostHead({ post, said }: { post: FeedPost; said?: string }): React.JSX.Element {
  return (
    <p className="flex min-w-0 items-baseline gap-1.5 text-control">
      <span data-feed-account className="truncate font-semibold text-foreground">You</span>
      <span className="shrink-0 text-muted-foreground">{kindWord(post)}</span>
      {post.made && (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground">·</span>
          <time dateTime={post.made} className="shrink-0 text-muted-foreground tabular-nums">{said ? `${said} ${written(post.made)}` : written(post.made)}</time>
        </>
      )}
    </p>
  )
}

const POLL: { value: PollAnswer; label: string }[] = [{ value: 'yes', label: 'Yes' }, { value: 'mixed', label: 'Mixed' }, { value: 'no', label: 'No' }]
const answersSaid = (answers: Record<PollAnswer, number>): string =>
  POLL.filter((one) => answers[one.value]).map((one) => `${num(answers[one.value])} ${one.value}`).join(', ')

/** A decision made weeks ago, asked again: "You chose it. Was it right?", and what you said kept on it as a dated thought. */
/** The words that say why two notes are one thread: "Both say *entropy*", "Both quote Seneca", "Kept within the same hour". */
const pairSaid = (why: NonNullable<FeedPost['pair']>['why']): React.ReactNode =>
  why.kind === 'word' ? <>Both say <em data-feed-pair-word className="font-medium text-foreground">{why.word}</em></>
    : why.kind === 'source' ? <>Both quote <span className="font-medium text-foreground">{why.source}</span></>
    : 'Kept within the same hour'

/**
 * "Two subjects, one thread": two notes with no tag in common that share an
 * unusual word, a source or an hour, side by side, each with its tags and each
 * opening its note, and the reason in plain words. Found without AI (feed-pair.ts).
 */
function PairPost({ post, onOpen, mark }: { post: FeedPost; onOpen: (type: string, id: string) => void; mark?: Mark }): React.JSX.Element {
  const { notes, why } = post.pair!
  const tags = notes.map((note) => note.tags[0]).filter(Boolean)
  return (
    <li data-feed-post="pair" data-feed-id={post.id} data-feed-at={mark?.at} onPointerDown={mark?.onPoint} className="relative isolate flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      <CursorRing on={!!mark?.cursor} />
      <p data-feed-context className="pl-12 text-control text-muted-foreground">Two subjects, one thread</p>
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center"><Avatar name="You" size={36} className="mt-0.5 shrink-0" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p data-feed-pair-why className="text-body text-foreground/90">
            {pairSaid(why)}
            {tags.length === 2 && <span className="text-muted-foreground"> · #{tags[0]} and #{tags[1]}</span>}
          </p>
          <div className="flex flex-col gap-2">
            {notes.map((note) => (
              <div key={note.id} data-feed-pair-note={note.id} className="flex min-w-0 flex-col gap-1.5">
                <Quoted note={note} onOpen={() => onOpen(note.type, note.id)} />
                {note.tags.length > 0 && (
                  <p className="flex flex-wrap gap-x-2 px-1 text-control">
                    {note.tags.map((tag) => <button key={tag} type="button" {...hoverNote('tag', tag)} onClick={(event) => (chime('page'), openTag(tag, event.altKey))} className="rounded-sm text-muted-foreground hover:text-foreground hover:underline">#{tag}</button>)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  )
}

function PollPost({ post, onOpen, mark }: { post: FeedPost; onOpen: () => void; mark?: Mark }): React.JSX.Element {
  const poll = post.poll!
  const [answer, setAnswer] = useState<PollAnswer | null>(poll.answer)
  const [answers, setAnswers] = useState(poll.answers)
  useEffect(() => (setAnswer(poll.answer), setAnswers(poll.answers)), [poll.answer, poll.answers])
  const choose = (value: PollAnswer): void => {
    const next = answer === value ? null : value
    chime(next ? 'decided' : 'undo')
    setAnswer(next)
    void call<Record<PollAnswer, number> | null>('feed:poll', `poll:${post.id}`, next).then((all) => all && setAnswers(all))
  }
  const total = answers.yes + answers.mixed + answers.no
  return (
    <li data-feed-post="poll" data-feed-id={post.id} data-feed-at={mark?.at} onPointerDown={mark?.onPoint} data-feed-answer={answer ?? undefined} className="relative isolate flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      <CursorRing on={!!mark?.cursor} />
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center"><Avatar name="You" size={36} className="mt-0.5 shrink-0" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PostHead post={post} said="decided" />
          <p data-feed-poll-ask className="text-body hyphens-auto [overflow-wrap:break-word] text-foreground">You chose <strong className="font-semibold">{post.title.replace(/[.\s]+$/, '')}</strong>. Was it right?</p>
          <div role="group" aria-label="Was it right?" className="grid w-[19.5rem] max-w-full grid-cols-3 gap-2">
            {POLL.map((one) => (
              <button key={one.value} type="button" data-feed-poll={one.value} aria-pressed={answer === one.value} onClick={() => choose(one.value)}
                className={cn('h-8 rounded-md border text-control font-medium transition-colors', answer === one.value ? 'border-primary/45 bg-primary/12 text-primary' : 'text-foreground hover:bg-foreground/[0.06]')}>
                {one.label}
              </button>
            ))}
          </div>
          {/* Always there, so nothing below moves when you choose. */}
          <p data-feed-poll-said className="min-h-5 text-control text-muted-foreground">
            {answer ? <>Kept on the decision as “Looking back: {answer}”.{total > 1 && <> Your answers so far: <span data-feed-poll-split className="text-foreground">{answersSaid(answers)}</span>.</>}</> : 'Your answer is kept on the decision, dated today.'}
            {' '}<OpenLink onOpen={onOpen}>Open the decision</OpenLink>
          </p>
        </div>
      </div>
    </li>
  )
}

/** A Review card due, asked here: its question, "Show answer", then Review's own four grades, graded exactly as Review would. */
function QuizPost({ post, onOpen, mark }: { post: FeedPost; onOpen: () => void; mark?: Mark }): React.JSX.Element {
  const quiz = post.quiz!
  const [shown, setShown] = useState(!!quiz.graded)
  const [graded, setGraded] = useState(quiz.graded)
  // The dates each grade promised when asked: a grade reschedules the card, and the buttons keep saying what they said.
  const [intervals] = useState(quiz.intervals)
  const { grades, two, name: gradeName } = useGrades()
  const started = useRef(Date.now())
  const reveal = (): void => (chime('reveal'), setShown(true))
  const grade = (value: 1 | 2 | 3 | 4): void => {
    if (graded || !shown) return
    chime((['again', 'hard', 'good', 'easy'] as const)[value - 1])
    void haligtree.grade(post.id, value, Date.now() - started.current).then((due) => {
      setGraded({ grade: value, due })
      void call('feed:quiz', post.id, value, due)
      quizUndo.current = undo
    })
  }
  // Review's own undo: the grade taken back, the card as it was before, and the grades open again.
  const undo = (): void => {
    if (quizUndo.current === undo) quizUndo.current = null
    void haligtree.ungrade(post.id).then((ok) => {
      if (!ok) return toast('That card was graded somewhere else since, so it stays as it is', undefined, 'error')
      chime('undo')
      setGraded(null)
      started.current = Date.now()
      void call('feed:unquiz', post.id)
    })
  }
  return (
    <li data-feed-post="quiz" data-feed-id={post.id} data-feed-at={mark?.at} onPointerDown={mark?.onPoint} data-feed-graded={graded?.grade ?? undefined} className="relative isolate flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      <CursorRing on={!!mark?.cursor} />
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center"><Avatar name="You" size={36} className="mt-0.5 shrink-0" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PostHead post={post} />
          <p data-feed-quiz-prompt className="text-body font-semibold hyphens-auto [overflow-wrap:break-word] text-foreground">{quiz.prompt}</p>
          {shown ? (
            <>
              <p data-feed-quiz-answer className="line-clamp-[8] rounded-lg border bg-accent/25 px-4 py-3 text-body leading-relaxed whitespace-pre-line hyphens-auto [overflow-wrap:break-word] text-foreground">{quiz.answer}</p>
              <div className={cn('grid max-w-[28rem] gap-2', two ? 'grid-cols-2' : 'grid-cols-4')}>
                {grades.map(({ grade: value, label, hint, tone }) => (
                  <Tip key={value} label={`${hint}: back ${backIn(intervals[value])}`}>
                    <button type="button" data-feed-grade={value} disabled={!!graded && graded.grade !== value} aria-pressed={graded?.grade === value} onClick={() => grade(value)}
                      style={{ '--tone': tone } as React.CSSProperties}
                      className={cn('flex min-h-12 w-full min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-control transition-colors disabled:opacity-40',
                        graded?.grade === value ? 'border-[color-mix(in_srgb,var(--tone)_60%,var(--border))] bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]' : !graded && 'hover:border-[color-mix(in_srgb,var(--tone)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]')}>
                      <span className="font-semibold" style={{ color: tone }}>{label}</span>
                      <span className="max-w-full truncate text-meta text-muted-foreground tabular-nums">{backIn(intervals[value])}</span>
                    </button>
                  </Tip>
                ))}
              </div>
              <p data-feed-quiz-said className="min-h-5 text-control text-muted-foreground">
                {graded ? `Graded ${quoted(gradeName(graded.grade), 80)}, as Review would: back ${backIn(graded.due)}.` : 'How did it feel? It counts as a review.'}
                {' '}{graded && <><button type="button" data-undo-grade onClick={undo} className="rounded-sm text-control text-(--mf-muted-strong) underline-offset-2 hover:text-foreground hover:underline">Undo {quoted(gradeName(graded.grade), 80)}</button>{' '}</>}
                <OpenLink onOpen={onOpen}>Open the card</OpenLink>
              </p>
            </>
          ) : (
            <span className="flex items-center gap-3">
              <button type="button" data-feed-quiz-show onClick={reveal} className="h-8 w-[9rem] rounded-md border text-control font-medium text-foreground transition-colors hover:bg-foreground/[0.06]">Show answer</button>
              <OpenLink onOpen={onOpen}>Open the card</OpenLink>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/** "Open the decision": a quiet link at the end of a poll's or a quiz card's line, not a lone button on a row of its own. */
function OpenLink({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button type="button" data-feed-open onClick={onOpen} className="inline-flex items-baseline gap-1 rounded-sm text-control text-(--mf-muted-strong) underline-offset-2 hover:text-foreground hover:underline">
      {children}<ArrowUpRight className="size-3.5 self-center" />
    </button>
  )
}

/** The old note under a restack: its account, kind, date and first lines, as a card that opens it. */
/**
 * A post's words with the notes they link to as links again ("Connected to:
 * Jokes & Bits" on an imported quote): each label, where it last appears, opens
 * its note, ⌥-click beside, and shows the note's card on a rest.
 */
function Linked({ text, links, onOpen }: { text: string; links?: FeedPost['links']; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const spots: { at: number; label: string; to: string }[] = []
  for (const link of links ?? []) {
    const at = text.lastIndexOf(link.label)
    if (at >= 0 && !spots.some((one) => at < one.at + one.label.length && one.at < at + link.label.length)) spots.push({ at, ...link })
  }
  if (!spots.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let from = 0
  for (const spot of spots.sort((a, b) => a.at - b.at)) {
    const [type, id] = spot.to.includes(':') ? [spot.to.slice(0, spot.to.indexOf(':')), spot.to.slice(spot.to.indexOf(':') + 1)] : ['capture', spot.to]
    parts.push(text.slice(from, spot.at))
    parts.push(
      <button key={spot.at} type="button" data-feed-link={spot.to} {...hoverNote(type, id)}
        onClick={(event) => (event.stopPropagation(), chime('page'), event.altKey ? openAside(type, id) : onOpen(type, id))}
        className="inline rounded-sm font-medium text-primary underline-offset-2 hover:underline">{spot.label}</button>
    )
    from = spot.at + spot.label.length
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

function Quoted({ note, onOpen }: { note: NonNullable<FeedPost['restack']> | Restackable; onOpen?: () => void }): React.JSX.Element {
  const quote = note.kind === 'quote'
  const account = (quote && note.who) || 'You'
  const body = (quote ? note.text || note.title : note.text) || ''
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-control">
        <Avatar name={account} size={18} className="shrink-0" />
        <span className="truncate font-semibold text-foreground">{account}</span>
        <span className="shrink-0 text-muted-foreground">{kindWord(note)}</span>
      </span>
      {quote ? (
        <span className="line-clamp-4 font-serif text-body leading-relaxed text-foreground">{body}</span>
      ) : (
        <>
          <span className="text-body font-semibold text-foreground">{splitTags(note.title).text || note.title}</span>
          {body && <span className="line-clamp-3 text-body text-foreground/85">{body}</span>}
        </>
      )}
    </>
  )
  return onOpen ? (
    <button type="button" data-feed-quoted onClick={onOpen} className="flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]">{inner}</button>
  ) : (
    <div data-feed-quoted className="flex flex-col gap-1 rounded-lg border px-3 py-2.5">{inner}</div>
  )
}

/** What a restack quotes: a post, or a Page from Reading. */
type Restackable = Pick<FeedPost, 'type' | 'id' | 'kind' | 'title' | 'text' | 'who'>
/** Restack: a new gem in your words, the old note quoted under it. ⌘↵ keeps it; it comes first in tomorrow's Feed. `initial`: a line chosen from it, to say again. */
export function Restack({ post, onDone, onOpen, initial = '', mind = false }: { post: Restackable; onDone: () => void; onOpen: (id: string) => void; initial?: string; /** "Changed my mind": the old note is marked as changed once it is kept. */ mind?: boolean }): React.JSX.Element {
  const [words, setWords] = useState(initial)
  useEffect(() => setWords(initial), [initial])
  const field = useRef<PlainHandle>(null)
  // The caret after what is already there, so "Now: " is typed straight on.
  useEffect(() => void requestAnimationFrame(() => { const box = field.current; if (box) (box.focus(), box.setSelectionRange(box.value.length, box.value.length)) }), [])
  const keep = async (): Promise<void> => {
    const said = words.trim()
    if (!said || said === MIND.trim()) return
    const id = await call<string | null>('feed:restack', `${post.type}:${post.id}`, said, mind)
    if (!id) return toast('That could not be kept: the note it quotes may be in the Bin', undefined, 'error')
    chime('send')
    onDone()
    toast("Kept in your words: it comes first in tomorrow's Feed", () => void call('feed:unrestack', id).then(() => chime('undo')), 'success', { label: 'Open', key: 'O', run: () => onOpen(id) })
  }
  return (
    <div data-feed-composer className="mt-1 flex flex-col gap-2 rounded-xl border bg-background p-3 focus-within:border-foreground/25" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="flex gap-2.5">
        <Avatar name="You" size={28} className="shrink-0" />
        <PlainField handle={field} autoFocus vimStart="insert" value={words} label="In your own words" placeholder="Why it matters to you now"
          onChange={setWords}
          onKey={(event) => {
            if (event.key === 'Enter' && event.metaKey) (event.preventDefault(), void keep())
            if (event.key === 'Escape') (event.preventDefault(), chime('fold'), onDone())
          }}
          className="min-h-12 min-w-0 flex-1 pt-1 text-body text-foreground" />
      </div>
      <div className="pl-[38px]"><Quoted note={post} /></div>
      <div className="flex items-center justify-end gap-2 text-control text-muted-foreground">
        <span className="mr-auto pl-[38px]">A new gem, linked to this one</span>
        <button type="button" onClick={() => (chime('fold'), onDone())} className="h-7 rounded-md px-2.5 transition-colors hover:bg-foreground/[0.06] hover:text-foreground">Cancel</button>
        <button type="button" data-feed-restack-save disabled={!words.trim() || words.trim() === MIND.trim()} onClick={() => void keep()}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground transition-opacity disabled:opacity-40">
          Say it again <Kbd className="border-primary-foreground/30 text-primary-foreground">⌘↵</Kbd>
        </button>
      </div>
    </div>
  )
}

/** How long since: "2 years", "8 months", "3 weeks", "5 days". */
const quietFor = (at: string): string => {
  const said = (n: number, unit: string): string => plural(n, unit)
  const years = dayjs().diff(dayjs(at), 'year')
  const months = dayjs().diff(dayjs(at), 'month')
  const days = Math.max(1, dayjs().diff(dayjs(at), 'day'))
  return years ? said(years, 'year') : months ? said(months, 'month') : days >= 14 ? said(Math.floor(days / 7), 'week') : said(days, 'day')
}
const readSide = (): Promise<FeedSide> => call<FeedSide>('feed:side')
const NO_SIDE = unread<FeedSide>({ quiet: [], week: [] })
const NO_SOURCES = unread<SourceSummary[]>([])
/**
 * Beside the posts, on a wide window only: your sources' faces, who and what
 * you have not heard from in a while, and what has been on your mind this
 * week. Each opens its page. Quiet: small words in the app's own islands,
 * inside the page's column, and gone wherever the posts would be squeezed.
 */
/** Faces shown before "All 40 sources". */
const FACES = 8
export function SideColumn({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const side = useLive(readSide, NO_SIDE, [], ['capture', 'item'], 'feed-side')
  const all = useLive(sources.list, NO_SOURCES, [], ['capture', 'item'])
  if (unloaded(side)) return null
  const people = all.filter((one) => one.field === 'attribution')
  const faces = [...people].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, FACES)
  // One set of letters for every face in the column, so two names never wear the same "S1".
  const letters = distinctInitials([...faces.map((one) => one.name), ...side.quiet.filter((one) => one.kind === 'source').map((one) => one.name)])
  const go = (run: () => void): void => (chime('page'), run())
  const row = 'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground transition-colors hover:bg-accent/60'
  return (
    // Beside the posts, staying in sight as they scroll (FeedColumns).
    <aside data-feed-side aria-label="Beside the Feed" className="page-dock-side">
      {faces.length > 0 && (
        <SideCard name="sources" title="Your sources">
          <div className="flex flex-wrap gap-1.5 px-2 pt-0.5 pb-1.5">
            {/* The face's hover card names it; no tip as well, so one thing shows at a time. */}
            {faces.map((one) => (
              <button key={one.name} type="button" {...hoverNote('person', one.name)} data-feed-face={one.name} aria-label={`Open ${one.name}'s page, ${plural(one.count, 'note')}`} onClick={() => go(() => openSource('attribution', one.name))}
                className="rounded-full ring-offset-2 ring-offset-background transition-transform duration-150 ease-(--mf-ease) hover:scale-[1.06] focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={one.name} size={34} letters={letters.get(one.name.trim())} />
              </button>
            ))}
          </div>
          {people.length > FACES && (
            <button type="button" data-feed-all-sources onClick={() => go(() => onOpen('view', 'sources'))} className={row}>
              <span className="min-w-0 flex-1 truncate">All {num(people.length)} sources</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          )}
        </SideCard>
      )}
      {side.quiet.length > 0 && (
        <SideCard name="quiet" title="Not heard from in a while">
          {side.quiet.map((one) => (
            <button key={`${one.kind}:${one.name}`} type="button" data-feed-quiet={one.kind} onClick={() => go(() => (one.kind === 'tag' ? openTag(one.name) : openSource('attribution', one.name)))} className={row}>
              {one.kind === 'tag' ? <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">#</span> : <Avatar name={one.name} size={20} letters={letters.get(one.name.trim())} className="shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{one.name}</span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{quietFor(one.last)}</span>
            </button>
          ))}
        </SideCard>
      )}
      {side.week.length > 0 && (
        <SideCard name="week" title="On your mind this week">
          {side.week.map((one) => (
            <button key={one.tag} type="button" data-feed-week={one.tag} onClick={() => go(() => openTag(one.tag))} className={row}>
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">#</span>
              <span className="min-w-0 flex-1 truncate">{one.tag}</span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{num(one.n)} {one.n === 1 ? 'note' : 'notes'}</span>
            </button>
          ))}
        </SideCard>
      )}
    </aside>
  )
}

/** A section's heading in every Feed tab: Liked's months, Reading's "Today's read", one role, size and spacing. */
/** The Feed's words on its top line ("20 likes on 20 posts"), in the look of a count beside tabs: set apart by a hairline, small. */
export function FeedSaid({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  // On a narrow page it gives its room to the tabs and the page's own controls, never cut off mid-word at the edge.
  return <span {...rest} className="mr-2 hidden min-w-0 truncate border-l border-foreground/15 pl-3 text-xs whitespace-nowrap tabular-nums text-muted-foreground @[44rem]/page:inline">{children}</span>
}

export function FeedHeading({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h2 {...rest} className="mt-6 mb-1 border-b pb-2 text-reading font-semibold tracking-[-0.01em] text-foreground first:mt-2">{children}</h2>
}

export function SideCard({ name, title, children }: { name: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section data-feed-side-card={name} className="mf-island rounded-lg border bg-accent/25 p-1">
      <h2 className="px-2 pt-1.5 pb-1 text-control font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/**
 * The Feed reads as a social feed does (X, Substack): one narrow column of posts with its side column right beside
 * it, the pair centred in the page; never a page-wide column. The side column stays in sight as the posts scroll.
 */
export function FeedColumns({ side, children }: { side: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="feed-columns">
      <div className="feed-posts">{children}</div>
      {side}
    </div>
  )
}
