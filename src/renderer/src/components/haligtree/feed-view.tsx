import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, Heart, CornerDownRight, EyeOff, ImageDown, MessageCircle, Repeat2, RefreshCcw, Share, X } from 'lucide-react'

import { call, haligtree, splitTags, unloaded, unread, useLive, type Gloss } from '@/lib/haligtree'
import { useThumb } from '@/lib/notes'
import { noteLinkText } from '@/lib/capture-links'
import { chime, type Cue } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { ago, dayjs, num } from '../../../../main/dates'
import type { Feed, FeedPost, FeedSide, PollAnswer, Reaction } from '../../../../main/feed'
import { GRADES } from './review-view'
import { backIn } from '@/lib/back-in'
import { openSource, sources, type SourceSummary } from '@/lib/sources'
import { Kbd, Page, Tip, jumpTo, openTag, quietly, toast } from './ui'
import { Avatar } from './avatar'
import { GlossLine, cutWords, openGloss } from './gloss-line'
import { MenuButton } from './collection-header'
import { copy, type MenuItem } from './row-menu'
import { motion } from 'motion/react'
import { GoalPreview, ReadyMoment, useReady } from './goal-preview'
import { FeedReading } from './feed-reading'
import { QueuedProvider, ReadLaterButton } from './read-later'
import { drawCard, xText, type CardPost } from '@/lib/feed-card'
import { LOOKABLE, lookAtPicture } from '@/components/image/image-look'

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

const KIND_WORD: Record<FeedPost['type'], string> = { nugget: 'Gem', capture: 'Note', article: 'Page', question: 'Question', day: 'Journal', poll: 'Poll', quiz: 'Quiz card' }
const kindWord = (post: { kind: string; type: FeedPost['type'] }): string => (post.kind === 'quote' ? 'Quote' : KIND_WORD[post.type])

/** A date: "4 Mar", with the year once it is not this year's, or always (`years`) in a thread that spans years. */
const written = (at: string, years = false): string => {
  const when = dayjs(at)
  return when.format(!years && when.year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')
}

/** The line over a post, when there is one: one you restacked, or one from long ago. */
const contextOf = (post: FeedPost): string | null => {
  if (post.restack) return 'You restacked'
  // Brought in by an importer: from your archives, whatever its date says.
  if (post.archive) return 'From the archives'
  // A thought added lately is hearing from it: only what has been quiet a year is from the archives.
  const last = [post.seen, post.gloss?.at, post.made].filter((one): one is string => !!one).sort().at(-1)!
  const made = dayjs(post.made)
  if (made.format('MM-DD') === dayjs().format('MM-DD') && made.year() < dayjs().year()) return dayjs().year() - made.year() === 1 ? 'A year ago today' : `${dayjs().year() - made.year()} years ago today`
  if (dayjs().diff(dayjs(last), 'day') >= 365) return 'From the archives'
  return null
}

/** Your own history with it, where it says something: "3 replies over 2 years", "seen 4 times". */
const repliesSaid = (post: FeedPost): string | null => {
  // One reply is the line hanging off the post already; "Show all" from two.
  if (post.replies < 2) return null
  const n = `Show all ${num(post.replies)} replies`
  if (!post.firstReply) return n
  const years = dayjs().year() - dayjs(post.firstReply).year() + 1
  const months = dayjs().diff(dayjs(post.firstReply), 'month')
  return years > 1 ? `${n} · over ${years} years` : months >= 2 ? `${n} · over ${months} months` : n
}

/** Each post's picture's width over its height, once seen. */
const SHAPES = new Map<string, number>()

const REACTIONS: { value: Reaction; label: string; tip: string; icon: typeof Heart; cue: Cue; said: string }[] = [
  { value: 'like', label: 'Like', tip: 'Like: more of this, it comes back sooner', icon: Heart, cue: 'promote', said: 'You liked it today' },
  { value: 'changed', label: 'Changed my mind', tip: 'Changed my mind: write what you think now, under it', icon: RefreshCcw, cue: 'shift', said: 'You changed your mind on it today' },
  { value: 'use', label: 'Use this', tip: "Use this: puts a link to it on today's Journal page", icon: CornerDownRight, cue: 'added', said: "On today's Journal page" },
  { value: 'less', label: 'Less of this', tip: 'Less of this: it comes up less often', icon: EyeOff, cue: 'away', said: 'You will see this less often' }
]

/** How often "Less of this" has faded it, in words: "once", "twice", "3 times". */
const timesSaid = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${num(n)} times`)
/** "Show as before": every fade taken back, with Undo. */
export const showAsBefore = (type: string, id: string): void => {
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
  return [hours && `${hours} ${hours === 1 ? 'hour' : 'hours'}`, rest && `${rest} ${rest === 1 ? 'minute' : 'minutes'}`].filter(Boolean).join(' ')
}

/** The nearest box that scrolls, so a thread opened and closed comes back to the same place. */
const scrollerOf = (node: HTMLElement | null): HTMLElement | null => {
  for (let at = node?.parentElement; at; at = at.parentElement) if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at
  return null
}

/** Which tab the Feed was left on, for the next time it opens. */
const TAB = 'feedTab'
type FeedTab = 'notes' | 'reading'
const FEED_TABS: { value: FeedTab; label: string }[] = [{ value: 'notes', label: 'Notes' }, { value: 'reading', label: 'Reading' }]
const keptTab = (): FeedTab => {
  try {
    return localStorage.getItem(TAB) === 'reading' ? 'reading' : 'notes'
  } catch {
    return 'notes'
  }
}

/** The app's tab chips, fixed on the left of the column: the one chosen slides under its word. */
export function TabChips<T extends string>({ name, tabs, value, onChange, className }: { name: string; tabs: { value: T; label: string }[]; value: T; onChange: (value: T) => void; className?: string }): React.JSX.Element {
  return (
    <span role="tablist" data-tabs={name} className={cn('flex h-8 w-fit items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control', className)}>
      {tabs.map((one) => (
        <button key={one.value} type="button" role="tab" data-tab={one.value} aria-selected={value === one.value}
          onClick={() => void (value !== one.value && (chime('tap'), onChange(one.value)))}
          className={cn('relative h-7 rounded-md px-3 transition-colors', value === one.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {value === one.value && <motion.span layoutId={`${name}-tab`} className="absolute inset-0 -z-10 rounded-md border border-foreground/15 bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {one.label}
        </button>
      ))}
    </span>
  )
}

const FINISHED = 'feedFinished'
/** The day whose Feed you read to its end, for Home's card. */
export const feedFinished = (): string | null => {
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
        <span className="font-heading text-heading font-semibold text-foreground">Today's feed</span>
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

/**
 * How a note being written will look in your Feed: the same post, without
 * its controls. Quick capture shows it while the pointer rests on Create.
 */
export function FeedPreview({ kind, text, who, secret }: { kind: string; text: string; who: string; secret: boolean }): React.JSX.Element {
  const lines = text.trim().split('\n').map((line) => line.trim()).filter(Boolean)
  const quote = kind === 'quote'
  const post: FeedPost = {
    type: 'capture', id: '', kind, title: lines[0]?.slice(0, 120) ?? '', text: quote ? lines.join('\n') : lines.slice(1).join('\n'), who: who.trim() || null,
    made: new Date().toISOString(), seen: null, gloss: null, clue: null, react: null, replies: 0, firstReply: null, seenTimes: 0, faded: 0, liked: 0, tags: [], restack: null
  }
  return (
    <div data-feed-preview className="flex flex-col gap-2">
      <p className="text-control font-medium text-muted-foreground">How it will look in your Feed</p>
      {secret ? <p data-feed-preview-private className="text-body text-foreground">Private notes never come up in the Feed.</p>
        : <ol className="pointer-events-none"><Post post={post} preview onOpen={() => {}} onOpenOther={() => {}} /></ol>}
    </div>
  )
}

export function FeedView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const [tab, setTab] = useState<FeedTab>(keptTab)
  const choose = (next: FeedTab): void => {
    setTab(next)
    try {
      localStorage.setItem(TAB, next)
    } catch {
      // Remembered while the window is open.
    }
  }
  const tabs = <TabChips name="feed" tabs={FEED_TABS} value={tab} onChange={choose} className="mb-5" />
  return <QueuedProvider>{tab === 'reading' ? <FeedReading tabs={tabs} onOpen={onOpen} /> : <FeedNotes tabs={tabs} onOpen={onOpen} />}</QueuedProvider>
}

function FeedNotes({ onOpen, tabs }: { onOpen: (type: string, id: string) => void; tabs: React.ReactNode }): React.JSX.Element {
  const feed = useLive(readFeed, NO_FEED, [], ['capture', 'item'], 'feed')
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
  const said = Object.entries(counts).map(([word, n]) => `${num(n)} ${word === 'Journal' ? (n === 1 ? 'Journal day' : 'Journal days') : n === 1 ? word.toLowerCase() : `${word.toLowerCase()}s`}`)
  const summary = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0]
  // The line says what the day holds, the three kinds it has most of: "8 gems, 5 quotes, 4 notes and 7 more".
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top = most.slice(0, 3).map(([word, n]) => `${num(n)} ${word === 'Journal' ? (n === 1 ? 'Journal day' : 'Journal days') : n === 1 ? word.toLowerCase() : `${word.toLowerCase()}s`}`)
  const rest = most.slice(3).reduce((sum, [, n]) => sum + n, 0)
  const holds = feed.posts.length && !feed.safe && !preview ? `${top.join(', ')}${rest ? ` and ${num(rest)} more` : ''}` : null
  return (
    <Page title="Feed" waiting={unloaded(feed) || real === null} lead={holds ? <span data-feed-holds className="truncate text-control text-muted-foreground">{holds}</span> : undefined}>
      <div ref={root} data-feed className="flex items-start gap-8 px-5 pt-[33px] pb-16">
      <div className="flex min-w-0 flex-1 flex-col">
        {!shown && tabs}
        {shown ? (
          <Thread post={shown} onBack={back} onOpen={() => open(shown.type, shown.id)} onOpenOther={open} />
        ) : feed.safe ? (
          <p data-feed-safe className="py-10 text-body text-foreground"><strong className="font-semibold">Safe mode is on</strong>, so the Feed rests until you turn it off.</p>
        ) : preview ? (
          <GoalPreview goal="Your Feed starts once you have 20 notes, with a few quotes or pictures among them" heading="What your Feed will look like"
            counts="Gems, quotes, questions, notes with a picture and Journal days a week old all count. Private notes and #bits never do."
            parts={[{ have: goal?.notes ?? 0, need: FEED_NOTES, what: 'notes' }, { have: goal?.quotes ?? 0, need: FEED_QUOTES, what: 'quotes or pictures' }]}>
            <ol className="flex flex-col">{SAMPLE_POSTS.map((post) => <Post key={post.id} post={post} preview onOpen={() => {}} onOpenOther={() => {}} />)}</ol>
          </GoalPreview>
        ) : !feed.posts.length ? (
          <p data-feed-empty className="py-10 text-body text-foreground">Nothing to show yet. Keep a gem, a quote or a question, and it comes back to you here.</p>
        ) : (
          <>
            {moment && <ReadyMoment said="Your Feed is ready" more="Each day it brings back about twenty of your own things, longest unseen first. A new set comes every morning." />}
            <ol className="flex flex-col">
              {feed.posts.map((post) => post.poll ? <PollPost key={`poll:${post.id}`} post={post} onOpen={() => open(post.poll!.open.type, post.poll!.open.id)} />
                : post.quiz ? <QuizPost key={`quiz:${post.id}`} post={post} onOpen={() => open('nugget', post.id)} />
                : <Post key={`${post.type}:${post.id}`} post={post} onOpen={() => open(post.type, post.id)} onOpenOther={open} onThread={() => openThread(post)} />)}
            </ol>
            <footer ref={endRef} data-feed-end className="flex flex-col items-center gap-1.5 py-12 text-center">
              <p className="font-heading text-[1.25rem] font-semibold tracking-[-0.01em] text-foreground">You're all caught up</p>
              <p className="max-w-[44ch] text-body text-foreground/85">{summary} came up today.</p>
              <p data-feed-next className="text-body text-muted-foreground">A new set in {until}.</p>
            </footer>
          </>
        )}
      </div>
      {!feed.safe && !preview && feed.posts.length > 0 && <SideColumn />}
      </div>
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
        <p className="font-heading text-[1.0625rem] font-semibold text-foreground">Post</p>
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
              <p className="text-body leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground/90 private-text">{gloss.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t pt-3 pl-12">
        {!unloaded(glosses) && <GlossLine id={post.id} latest={false} open={!thread.length} placeholder="Your reply, in your own words" />}
      </div>
    </section>
  )
}

function Post({ post, onOpen, onOpenOther, onThread, alone = false, joined = false, preview = false }: {
  post: FeedPost
  onOpen: () => void
  onOpenOther: (type: string, id: string) => void
  onThread?: () => void
  /** On its own page, with its thread below. */
  alone?: boolean
  /** Only how it will look: no controls, as quick capture shows it before it is kept. */
  preview?: boolean
  /** A thread follows, so a line runs down from its picture. */
  joined?: boolean
}): React.JSX.Element {
  const quote = post.kind === 'quote'
  const account = (quote && post.who) || 'You'
  const context = contextOf(post)
  const thumb = useThumb(post.type === 'day' ? '' : post.id)
  const picture = thumb && !/\.(mp4|m4v|mov|webm)$/i.test(thumb) ? thumb : undefined
  const [broken, setBroken] = useState(false)
  // Its width over its height, once loaded: it fills the post's width unless that would make it taller than 720px.
  // Kept per picture, so a post drawn again (back from a thread) has its height at once and nothing below it moves.
  const [shape, setShapeNow] = useState<number | null>(() => SHAPES.get(post.id) ?? null)
  const setShape = (value: number | null): void => (value && SHAPES.set(post.id, value), setShapeNow(value))
  // What you chose shows at once; the Feed's next read says the same.
  const [chosen, setChosen] = useState<Reaction | null>(post.react)
  useEffect(() => setChosen(post.react), [post.react])
  const [restacking, setRestacking] = useState(false)
  const self = useRef<HTMLLIElement>(null)
  const words = quote ? post.text || post.title : post.text
  const link = post.type === 'capture' ? post.id : `${post.type === 'question' ? 'nugget' : post.type}:${post.id}`
  // What is not worth a glance on every post waits in ⋯: the reactions after "Still true", then Open and Copy link.
  const reaction = (value: Reaction): MenuItem => {
    const one = REACTIONS.find((it) => it.value === value)!
    return { id: value, label: one.label, hint: one.tip, icon: <one.icon className="size-4" />, trail: chosen === value ? <Check className="ml-auto size-4 text-primary" /> : undefined, run: () => choose(value) }
  }
  const menu: MenuItem[] = [
    post.type !== 'day' && reaction('changed'),
    reaction('use'),
    post.type !== 'day' && reaction('less'),
    'separator',
    { id: 'open', label: 'Open', icon: <ArrowUpRight className="size-4" />, run: onOpen },
    post.type !== 'day' && { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(link, post.title), 'Copied a link: paste it into any note') },
    // The Feed never shows a private note, so every post here may be a picture.
    'separator',
    { id: 'save-image', label: 'Save as image', hint: 'A picture of this post, in the current theme', icon: <ImageDown className="size-4" />, run: () => void saveImage() },
    { id: 'share-x', label: 'Share to X', hint: 'Its words in X, its picture copied to paste in', icon: <Share className="size-4" />, run: () => void shareX() }
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
    chosen && chosen !== 'less' && REACTIONS.find((one) => one.value === chosen)!.said,
    // Its likes over time, never anyone else's: today's counts at once.
    Math.max(post.liked, chosen === 'like' ? 1 : 0) >= 2 && `liked ${num(Math.max(post.liked, chosen === 'like' ? 1 : 0))} times`,
    post.seenTimes >= 2 && `seen ${num(post.seenTimes)} times`
  ].filter(Boolean) as string[]
  const replies = repliesSaid(post)
  // The newest thought on it, hung under the post (not on its own page, where the thread is).
  const glosses = useLive(() => (alone || preview ? Promise.resolve([] as Gloss[]) : haligtree.glosses(post.id)), [] as Gloss[], [post.id, alone, preview])
  const hang = onThread && !unloaded(glosses) ? glosses[0] : undefined
  // Faded by "Less of this", today or before: how far, and the way back. Today's choice counts at once.
  const faded = Math.max(post.faded, chosen === 'less' ? 1 : 0)

  return (
    // Carried to the window's side, it opens beside the Feed (split-drop.tsx).
    <li ref={self} data-drag-open={preview ? undefined : `${post.type}:${post.id}`} data-drag-title={title} data-look-group data-feed-post={post.type} data-feed-id={post.id} data-feed-archive={post.archive || undefined} data-feed-kind={post.kind} data-feed-react={chosen ?? undefined}
      className={cn('flex flex-col gap-1 py-4 transition-opacity duration-300 first:pt-0', !alone && 'border-b last:border-b-0', alone && joined && 'pb-3', chosen === 'less' && 'opacity-45 hover:opacity-80 has-[:focus-visible]:opacity-100')}>
      {context && <p data-feed-context className="flex items-center gap-1.5 pl-12 text-control text-muted-foreground">{post.restack && <Repeat2 className="size-3.5" />}{context}</p>}
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
              <button type="button" data-feed-account data-feed-source onClick={openWho} className="truncate rounded-sm font-semibold text-foreground hover:underline">{account}</button>
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
            {post.type !== 'day' && !preview && (
              <Tip label={REACTIONS[3].tip}>
                <button type="button" data-feed-reaction="less" aria-pressed={chosen === 'less'} aria-label="Less of this" onClick={() => choose('less')}
                  className={cn('-my-1.5 -mr-1.5 ml-auto flex size-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground', chosen === 'less' && 'text-primary hover:text-primary')}>
                  <X className="size-4" />
                </button>
              </Tip>
            )}
          </p>
          {quote ? (
            // The quote is its own way in: a click anywhere on it opens the note it is, as a title does.
            <figure data-feed-quote role="link" tabIndex={0} aria-label={`Open the quote${post.who ? ` by ${post.who}` : ''}`}
              onClick={(event) => !(event.target as HTMLElement).closest('a, button') && window.getSelection()?.isCollapsed !== false && onOpen()}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onOpen())}
              className="cursor-pointer rounded-lg border bg-accent/25 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring">
              <blockquote className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground line-clamp-[10]">{words}</blockquote>
              {post.who && <figcaption data-feed-author className="mt-2 text-control font-medium text-foreground/80">{post.who}</figcaption>}
            </figure>
          ) : (
            <>
              <button type="button" data-feed-title onClick={onOpen} className="w-fit rounded-sm text-left text-body font-semibold [overflow-wrap:anywhere] text-foreground underline-offset-2 hover:underline">{title}</button>
              {post.type !== 'question' && text && <p className="line-clamp-[8] text-body leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground/90">{text}</p>}
            </>
          )}
          {post.tags.length > 0 && (
            <p data-feed-tags className="flex flex-wrap gap-x-2 text-control">
              {post.tags.map((tag) => <button key={tag} type="button" data-feed-tag={tag} onClick={() => (chime('page'), openTag(tag))} className="rounded-sm text-muted-foreground hover:text-foreground hover:underline">#{tag}</button>)}
            </p>
          )}
          {post.restack && <Quoted note={post.restack} onOpen={() => onOpenOther(post.restack!.type, post.restack!.id)} />}
          {/* Its picture still on its way, drawn before: its room kept, so the posts below never move. */}
          {!picture && shape && !broken && <div aria-hidden data-feed-picture-room className="mt-1 max-w-full rounded-xl border bg-accent/40" style={{ width: `min(100%, ${Math.round(720 * shape)}px)`, aspectRatio: String(shape) }} />}
          {picture && !broken && (
            // The whole picture at its own shape, never cropped and never boxed in bars: the full width of the post
            // (a square one too); only one so tall it would run past 720px stands at that height, as wide as it then is.
            // Clicked, it opens in the viewer as a picture in a note does; Esc puts it back.
            <button type="button" data-feed-picture aria-label="Look at the picture" onClick={(event) => lookAtPicture(event.currentTarget.querySelector('img'))}
              className={cn('mt-1 block max-w-full overflow-hidden rounded-xl border bg-accent/40', LOOKABLE)} style={{ width: shape ? `min(100%, ${Math.round(720 * shape)}px)` : '100%' }}>
              <img data-look src={picture} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)}
                onLoad={(event) => setShape(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || null)}
                className="block h-auto w-full" style={shape ? { aspectRatio: String(shape) } : undefined} />
            </button>
          )}
        </div>
      </div>
      {/* The latest thought hangs off the post on a bent line, the sidebar's Pinned tree's way; the rest are in its thread. */}
      {hang && (
        <div data-feed-hanging className="flex gap-3 pt-2.5 pb-2">
          <div aria-hidden className="relative w-9 shrink-0">
            {/* Down from the line under the picture, then bent toward the reply's first line. */}
            <svg className="absolute -top-[14px] left-[17.5px] h-[25px] w-[26px] overflow-visible text-border" viewBox="0 0 26 25" fill="none">
              <path d="M0.5 0 V19.5 Q0.5 24.5 5.5 24.5 H26" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <button type="button" data-feed-latest onClick={onThread} title={hang.body}
              className="group/hang line-clamp-2 min-w-0 rounded-sm text-left text-control text-foreground/85 [overflow-wrap:anywhere] hover:text-foreground">
              <span className="private-text group-hover/hang:underline">{cutWords(hang.body, 140)}</span>
              <span data-feed-latest-date className="text-meta whitespace-nowrap text-muted-foreground"> · {hang.author === 'ai' ? 'AI, ' : ''}{ago(hang.createdAt)}</span>
            </button>
            {replies && (
              <button type="button" data-feed-replies onClick={onThread} className="rounded-sm text-control text-muted-foreground hover:text-foreground hover:underline">{replies}</button>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <div aria-hidden className="w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Writing a reply opens here, under the latest; closed, it takes no room. */}
          {!alone && !preview && <GlossLine id={post.id} quiet latest={false} className="mt-0.5" placeholder={chosen === 'changed' ? 'What you think now, in your own words' : 'Your reply, in your own words'} />}
          {/* Every control keeps its own fixed place: choosing one changes its colour, never the row. */}
          <div data-feed-actions className={cn('-ml-2 flex items-center gap-1 text-muted-foreground', preview && 'hidden')}>
            {(
              <button type="button" data-feed-reply onClick={() => openGloss(post.id)}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <MessageCircle className="size-4" /> Reply
              </button>
            )}
            <Tip label="Restack: say it again in your own words, with this quoted under it">
              <button type="button" data-feed-restack aria-label="Restack" aria-pressed={restacking} onClick={() => (chime(restacking ? 'fold' : 'tap'), setRestacking(!restacking))}
                className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground', restacking && 'text-foreground')}>
                <Repeat2 className="size-4 shrink-0" /> Restack
              </button>
            </Tip>
            {post.type !== 'day' && post.type !== 'poll' && post.type !== 'quiz' && <ReadLaterButton id={post.id} />}
            {/* The like, where the thumb looks for it (a Journal day too: liked, it comes back sooner); the rest are in ⋯. Chosen, it fills in red and nothing moves. */}
            {(
              <Tip label={REACTIONS[0].tip}>
                <button type="button" data-feed-reaction="like" aria-pressed={chosen === 'like'} aria-label="Like" onClick={() => choose('like')}
                  className={cn('flex size-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground', chosen === 'like' && 'text-[var(--tt-color-text-red)] hover:text-[var(--tt-color-text-red)]')}>
                  <Heart className="size-4" fill={chosen === 'like' ? 'currentColor' : 'none'} />
                </button>
              </Tip>
            )}
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
          {restacking && <Restack post={post} onDone={() => setRestacking(false)} onOpen={(id) => onOpenOther('nugget', id)} />}
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
function PollPost({ post, onOpen }: { post: FeedPost; onOpen: () => void }): React.JSX.Element {
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
    <li data-feed-post="poll" data-feed-id={post.id} data-feed-answer={answer ?? undefined} className="flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center"><Avatar name="You" size={36} className="mt-0.5 shrink-0" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PostHead post={post} said="decided" />
          <p data-feed-poll-ask className="text-body [overflow-wrap:anywhere] text-foreground">You chose <strong className="font-semibold">{post.title.replace(/[.\s]+$/, '')}</strong>. Was it right?</p>
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
function QuizPost({ post, onOpen }: { post: FeedPost; onOpen: () => void }): React.JSX.Element {
  const quiz = post.quiz!
  const [shown, setShown] = useState(!!quiz.graded)
  const [graded, setGraded] = useState(quiz.graded)
  // The dates each grade promised when asked: a grade reschedules the card, and the buttons keep saying what they said.
  const [intervals] = useState(quiz.intervals)
  const started = useRef(Date.now())
  const reveal = (): void => (chime('reveal'), setShown(true))
  const grade = (value: 1 | 2 | 3 | 4): void => {
    if (graded) return
    chime((['again', 'hard', 'good', 'easy'] as const)[value - 1])
    void haligtree.grade(post.id, value, Date.now() - started.current).then((due) => {
      setGraded({ grade: value, due })
      void call('feed:quiz', post.id, value, due)
    })
  }
  return (
    <li data-feed-post="quiz" data-feed-id={post.id} data-feed-graded={graded?.grade ?? undefined} className="flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center"><Avatar name="You" size={36} className="mt-0.5 shrink-0" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PostHead post={post} />
          <p data-feed-quiz-prompt className="text-body font-semibold [overflow-wrap:anywhere] text-foreground">{quiz.prompt}</p>
          {shown ? (
            <>
              <p data-feed-quiz-answer className="line-clamp-[8] rounded-lg border bg-accent/25 px-4 py-3 text-body leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground">{quiz.answer}</p>
              <div className="grid max-w-[28rem] grid-cols-4 gap-2">
                {GRADES.map(({ grade: value, label, hint, tone }) => (
                  <Tip key={value} label={`${hint}: back ${backIn(intervals[value])}`}>
                    <button type="button" data-feed-grade={value} disabled={!!graded && graded.grade !== value} aria-pressed={graded?.grade === value} onClick={() => grade(value)}
                      style={{ '--tone': tone } as React.CSSProperties}
                      className={cn('flex min-h-12 w-full min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-control transition-colors disabled:opacity-40',
                        graded?.grade === value ? 'border-[color-mix(in_srgb,var(--tone)_60%,var(--border))] bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]' : !graded && 'hover:border-[color-mix(in_srgb,var(--tone)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]')}>
                      <span className="font-semibold" style={{ color: tone }}>{label}</span>
                      <span className="max-w-full truncate text-xs text-muted-foreground tabular-nums">{backIn(intervals[value])}</span>
                    </button>
                  </Tip>
                ))}
              </div>
              <p data-feed-quiz-said className="min-h-5 text-control text-muted-foreground">
                {graded ? `Graded “${GRADES[graded.grade - 1].label}”, as Review would: back ${backIn(graded.due)}.` : 'How did it feel? It counts as a review.'}
                {' '}<OpenLink onOpen={onOpen}>Open the card</OpenLink>
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
    <button type="button" data-feed-open onClick={onOpen} className="inline-flex items-baseline gap-1 rounded-sm text-control text-foreground/80 underline-offset-2 hover:text-foreground hover:underline">
      {children}<ArrowUpRight className="size-3.5 self-center" />
    </button>
  )
}

/** The old note under a restack: its account, kind, date and first lines, as a card that opens it. */
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
        <span className="line-clamp-4 font-serif text-[1rem] leading-relaxed text-foreground">{body}</span>
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
export type Restackable = Pick<FeedPost, 'type' | 'id' | 'kind' | 'title' | 'text' | 'who'>
/** Restack: a new gem in your words, the old note quoted under it. ⌘↵ keeps it; it comes first in tomorrow's Feed. `initial`: a line chosen from it, to say again. */
export function Restack({ post, onDone, onOpen, initial = '' }: { post: Restackable; onDone: () => void; onOpen: (id: string) => void; initial?: string }): React.JSX.Element {
  const [words, setWords] = useState(initial)
  useEffect(() => setWords(initial), [initial])
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => void requestAnimationFrame(() => field.current?.focus()), [])
  const keep = async (): Promise<void> => {
    const said = words.trim()
    if (!said) return
    const id = await call<string | null>('feed:restack', `${post.type}:${post.id}`, said)
    if (!id) return toast('That note could not be restacked', undefined, 'error')
    chime('send')
    onDone()
    toast("Restacked: it comes first in tomorrow's Feed", () => void call('feed:unrestack', id).then(() => chime('undo')), 'success', { label: 'Open', key: 'O', run: () => onOpen(id) })
  }
  return (
    <div data-feed-composer className="mt-1 flex flex-col gap-2 rounded-xl border bg-background p-3 focus-within:border-foreground/25" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="flex gap-2.5">
        <Avatar name="You" size={28} className="shrink-0" />
        <textarea ref={field} rows={2} value={words} aria-label="Your restack" placeholder="Why it matters to you now"
          onChange={(event) => setWords(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.metaKey) (event.preventDefault(), void keep())
            if (event.key === 'Escape') (event.preventDefault(), chime('fold'), onDone())
          }}
          className="min-h-12 min-w-0 flex-1 resize-none bg-transparent pt-1 text-body text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground" />
      </div>
      <div className="pl-[38px]"><Quoted note={post} /></div>
      <div className="flex items-center justify-end gap-2 text-control text-muted-foreground">
        <span className="mr-auto pl-[38px]">A new gem, linked to this one</span>
        <button type="button" onClick={() => (chime('fold'), onDone())} className="h-7 rounded-md px-2.5 transition-colors hover:bg-foreground/[0.06] hover:text-foreground">Cancel</button>
        <button type="button" data-feed-restack-save disabled={!words.trim()} onClick={() => void keep()}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground transition-opacity disabled:opacity-40">
          Restack <Kbd className="border-primary-foreground/30 text-primary-foreground">⌘↵</Kbd>
        </button>
      </div>
    </div>
  )
}

/** How long since: "2 years", "8 months", "3 weeks", "5 days". */
const quietFor = (at: string): string => {
  const said = (n: number, unit: string): string => `${num(n)} ${unit}${n === 1 ? '' : 's'}`
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
function SideColumn(): React.JSX.Element | null {
  const side = useLive(readSide, NO_SIDE, [], ['capture', 'item'], 'feed-side')
  const all = useLive(sources.list, NO_SOURCES, [], ['capture', 'item'])
  if (unloaded(side)) return null
  const faces = all.filter((one) => one.field === 'attribution').sort((a, b) => b.count - a.count).slice(0, 8)
  const go = (run: () => void): void => (chime('page'), run())
  const row = 'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground transition-colors hover:bg-accent/60'
  return (
    <aside data-feed-side aria-label="Beside the Feed" className="sticky top-[33px] mt-[3.25rem] hidden w-[15.5rem] shrink-0 flex-col gap-3 @[56rem]/page:flex">
      {faces.length > 0 && (
        <SideCard name="sources" title="Your sources">
          <div className="flex flex-wrap gap-1.5 px-2 pt-0.5 pb-1.5">
            {faces.map((one) => (
              <Tip key={one.name} label={`${one.name}: ${num(one.count)} ${one.count === 1 ? 'note' : 'notes'}`}>
                <button type="button" data-feed-face={one.name} aria-label={`Open ${one.name}'s page`} onClick={() => go(() => openSource('attribution', one.name))}
                  className="rounded-full ring-offset-2 ring-offset-background transition-transform duration-150 ease-(--mf-ease) hover:scale-[1.06] focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar name={one.name} size={34} />
                </button>
              </Tip>
            ))}
          </div>
        </SideCard>
      )}
      {side.quiet.length > 0 && (
        <SideCard name="quiet" title="Not heard from in a while">
          {side.quiet.map((one) => (
            <button key={`${one.kind}:${one.name}`} type="button" data-feed-quiet={one.kind} onClick={() => go(() => (one.kind === 'tag' ? openTag(one.name) : openSource('attribution', one.name)))} className={row}>
              {one.kind === 'tag' ? <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">#</span> : <Avatar name={one.name} size={20} className="shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{one.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{quietFor(one.last)}</span>
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
              <span className="shrink-0 text-muted-foreground tabular-nums">{num(one.n)} {one.n === 1 ? 'note' : 'notes'}</span>
            </button>
          ))}
        </SideCard>
      )}
    </aside>
  )
}

function SideCard({ name, title, children }: { name: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section data-feed-side-card={name} className="mf-island rounded-lg border bg-accent/25 p-1">
      <h2 className="px-2 pt-1.5 pb-1 text-control font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}
