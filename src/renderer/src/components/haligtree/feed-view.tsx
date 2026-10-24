import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, BadgeCheck, CornerDownRight, EyeOff, MessageCircle, Repeat2, RefreshCcw } from 'lucide-react'

import { call, haligtree, splitTags, unloaded, unread, useLive, type Gloss } from '@/lib/haligtree'
import { useThumb } from '@/lib/notes'
import { noteLinkText } from '@/lib/capture-links'
import { chime, type Cue } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { dayjs, num } from '../../../../main/dates'
import type { Feed, FeedPost, Reaction } from '../../../../main/feed'
import { Kbd, Page, Tip, quietly, toast } from './ui'
import { Avatar } from './avatar'
import { GlossLine, openGloss } from './gloss-line'
import { MenuButton } from './collection-header'
import { copy } from './row-menu'

/**
 * The Feed: the day's twenty or so of your own things, as posts in a
 * timeline. Each post's account is where it came from: a quote's author, or
 * you. It ends: once you reach the bottom you are caught up until tomorrow.
 * A post opens on its own (its date, or its replies) as a thread of every
 * thought you kept on it.
 */
const readFeed = (): Promise<Feed> => call<Feed>('feed')
const NO_FEED = unread<Feed>({ day: '', posts: [], safe: false })
const react = (post: FeedPost, reaction: Reaction | null): Promise<Reaction | null> => call<Reaction | null>('feed:react', `${post.type}:${post.id}`, reaction)

const KIND_WORD: Record<FeedPost['type'], string> = { nugget: 'Gem', capture: 'Note', article: 'Page', question: 'Question', day: 'Journal' }
const kindWord = (post: { kind: string; type: FeedPost['type'] }): string => (post.kind === 'quote' ? 'Quote' : KIND_WORD[post.type])

/** A date: "4 Mar", with the year once it is not this year's. */
const written = (at: string): string => {
  const when = dayjs(at)
  return when.format(when.year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')
}

/** The line over a post, when there is one: one you restacked, or one from long ago. */
const contextOf = (post: FeedPost): string | null => {
  if (post.restack) return 'You restacked'
  const last = post.seen ?? post.made
  const made = dayjs(post.made)
  if (made.format('MM-DD') === dayjs().format('MM-DD') && made.year() < dayjs().year()) return dayjs().year() - made.year() === 1 ? 'A year ago today' : `${dayjs().year() - made.year()} years ago today`
  if (dayjs().diff(dayjs(last), 'day') >= 365) return 'From the archives'
  return null
}

/** Your own history with it, where it says something: "3 replies over 2 years", "seen 4 times". */
const repliesSaid = (post: FeedPost): string | null => {
  // One reply is the line above the row already; a count says something from two.
  if (post.replies < 2) return null
  const n = `${num(post.replies)} ${post.replies === 1 ? 'reply' : 'replies'}`
  if (!post.firstReply) return n
  const years = dayjs().year() - dayjs(post.firstReply).year() + 1
  const months = dayjs().diff(dayjs(post.firstReply), 'month')
  return years > 1 ? `${n} over ${years} years` : months >= 2 ? `${n} over ${months} months` : n
}

const REACTIONS: { value: Reaction; label: string; tip: string; icon: typeof BadgeCheck; cue: Cue; said: string }[] = [
  { value: 'true', label: 'Still true', tip: 'Still true: it comes back later, on its usual rhythm', icon: BadgeCheck, cue: 'stay', said: 'You said it is still true today' },
  { value: 'changed', label: 'Changed my mind', tip: 'Changed my mind: write what you think now, under it', icon: RefreshCcw, cue: 'shift', said: 'You changed your mind on it today' },
  { value: 'use', label: 'Use this', tip: "Use this: puts a link to it on today's Journal page", icon: CornerDownRight, cue: 'added', said: "On today's Journal page" },
  { value: 'less', label: 'Less of this', tip: 'Less of this: it comes up less often', icon: EyeOff, cue: 'away', said: 'You will see this less often' }
]

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

export function FeedView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const feed = useLive(readFeed, NO_FEED, [], ['capture', 'item'], 'feed')
  const until = useUntilTomorrow()
  const root = useRef<HTMLDivElement>(null)
  const [thread, setThread] = useState<string | null>(null)
  const place = useRef(0)
  const open = (type: string, id: string): void => (chime('open'), onOpen(type, id))
  const openThread = (post: FeedPost): void => {
    place.current = scrollerOf(root.current)?.scrollTop ?? 0
    chime('page')
    setThread(`${post.type}:${post.id}`)
  }
  const back = (): void => (chime('back'), setThread(null))
  // Back to the same place in the list, before it is drawn.
  useLayoutEffect(() => {
    const scroller = scrollerOf(root.current)
    if (scroller) scroller.scrollTop = thread ? 0 : place.current
  }, [thread])
  const shown = thread ? feed.posts.find((post) => `${post.type}:${post.id}` === thread) : undefined
  const counts = feed.posts.reduce<Record<string, number>>((all, post) => ({ ...all, [kindWord(post)]: (all[kindWord(post)] ?? 0) + 1 }), {})
  const said = Object.entries(counts).map(([word, n]) => `${num(n)} ${word === 'Journal' ? (n === 1 ? 'Journal day' : 'Journal days') : n === 1 ? word.toLowerCase() : `${word.toLowerCase()}s`}`)
  const summary = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0]
  return (
    <Page title="Feed" waiting={unloaded(feed)} count={feed.posts.length || undefined} unit={['post today', 'posts today']}>
      <div ref={root} data-feed className="flex flex-col px-5 pt-[33px] pb-16">
        {shown ? (
          <Thread post={shown} onBack={back} onOpen={() => open(shown.type, shown.id)} onOpenOther={open} />
        ) : feed.safe ? (
          <p data-feed-safe className="py-10 text-body text-foreground"><strong className="font-semibold">Safe mode is on</strong>, so the Feed rests until you turn it off.</p>
        ) : !feed.posts.length ? (
          <p data-feed-empty className="py-10 text-body text-foreground">Nothing to show yet. Keep a gem, a quote or a question, and it comes back to you here.</p>
        ) : (
          <>
            <ol className="flex flex-col">
              {feed.posts.map((post) => <Post key={`${post.type}:${post.id}`} post={post} onOpen={() => open(post.type, post.id)} onOpenOther={open} onThread={() => openThread(post)} />)}
            </ol>
            <footer data-feed-end className="flex flex-col items-center gap-1.5 py-12 text-center">
              <p className="font-heading text-[1.25rem] font-semibold tracking-[-0.01em] text-foreground">You're all caught up</p>
              <p className="max-w-[44ch] text-body text-foreground/85">{summary} came up today.</p>
              <p data-feed-next className="text-body text-muted-foreground">A new set in {until}.</p>
            </footer>
          </>
        )}
      </div>
    </Page>
  )
}

/** One post on its own, its thoughts below it as a thread, oldest first, and a reply box at the foot. */
function Thread({ post, onBack, onOpen, onOpenOther }: { post: FeedPost; onBack: () => void; onOpen: () => void; onOpenOther: (type: string, id: string) => void }): React.JSX.Element {
  const glosses = useLive(() => haligtree.glosses(post.id), [] as Gloss[], [post.id])
  const thread = [...glosses].reverse()
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
                <time data-feed-gloss-at dateTime={gloss.createdAt} className="text-muted-foreground tabular-nums">{written(gloss.createdAt)}</time>
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

function Post({ post, onOpen, onOpenOther, onThread, alone = false, joined = false }: {
  post: FeedPost
  onOpen: () => void
  onOpenOther: (type: string, id: string) => void
  onThread?: () => void
  /** On its own page, with its thread below. */
  alone?: boolean
  /** A thread follows, so a line runs down from its picture. */
  joined?: boolean
}): React.JSX.Element {
  const quote = post.kind === 'quote'
  const account = (quote && post.who) || 'You'
  const context = contextOf(post)
  const thumb = useThumb(post.type === 'day' ? '' : post.id)
  const picture = thumb && !/\.(mp4|m4v|mov|webm)$/i.test(thumb) ? thumb : undefined
  const [broken, setBroken] = useState(false)
  // What you chose shows at once; the Feed's next read says the same.
  const [chosen, setChosen] = useState<Reaction | null>(post.react)
  useEffect(() => setChosen(post.react), [post.react])
  const [restacking, setRestacking] = useState(false)
  const words = quote ? post.text || post.title : post.text
  const link = post.type === 'capture' ? post.id : `${post.type === 'question' ? 'nugget' : post.type}:${post.id}`
  const menu = [
    { label: 'Open', run: onOpen },
    post.type !== 'day' && { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(link, post.title), 'Copied a link: paste it into any note') }
  ]
  const title = post.type === 'day' ? dayjs(post.id).format(dayjs(post.id).year() === dayjs().year() ? 'dddd D MMMM' : 'dddd D MMMM YYYY') : splitTags(post.title).text || post.title
  // A restack's link to the old note is said by the card under it, not twice.
  const text = post.restack ? post.text.split('\n').filter((line) => line.trim() !== post.restack!.title.replace(/\s+/g, ' ').trim().slice(0, 80)).join('\n') : post.text

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
    if (next === 'changed') openGloss(post.id)
  }

  const history = [
    chosen && REACTIONS.find((one) => one.value === chosen)!.said,
    post.seenTimes >= 2 && `seen ${num(post.seenTimes)} times`
  ].filter(Boolean) as string[]
  const replies = repliesSaid(post)

  return (
    <li data-feed-post={post.type} data-feed-id={post.id} data-feed-kind={post.kind} data-feed-react={chosen ?? undefined}
      className={cn('flex flex-col gap-1 py-4 transition-opacity duration-300 first:pt-0', !alone && 'border-b last:border-b-0', alone && joined && 'pb-3', chosen === 'less' && 'opacity-45 hover:opacity-80 has-[:focus-visible]:opacity-100')}>
      {context && <p data-feed-context className="flex items-center gap-1.5 pl-12 text-control text-muted-foreground">{post.restack && <Repeat2 className="size-3.5" />}{context}</p>}
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center">
          <Avatar name={account} size={36} className="mt-0.5 shrink-0" />
          {joined && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 items-baseline gap-1.5 text-control">
            <span data-feed-account className="truncate font-semibold text-foreground">{account}</span>
            <span className="shrink-0 text-muted-foreground">{kindWord(post)}</span>
            <span aria-hidden className="shrink-0 text-muted-foreground">·</span>
            {onThread ? (
              <button type="button" data-feed-date onClick={onThread} className="shrink-0 rounded-sm text-muted-foreground tabular-nums hover:text-foreground hover:underline">
                <time dateTime={post.made}>{written(post.made)}</time>
              </button>
            ) : (
              <time dateTime={post.made} className="shrink-0 text-muted-foreground tabular-nums">{written(post.made)}</time>
            )}
          </p>
          {quote ? (
            <figure data-feed-quote className="rounded-lg border bg-accent/25 px-4 py-3">
              <blockquote className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground line-clamp-[10]">{words}</blockquote>
              {post.who && <figcaption data-feed-author className="mt-2 text-control font-medium text-foreground/80">{post.who}</figcaption>}
            </figure>
          ) : (
            <>
              <p className="text-body font-semibold [overflow-wrap:anywhere] text-foreground">{title}</p>
              {post.type !== 'question' && text && <p className="line-clamp-[8] text-body leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground/90">{text}</p>}
            </>
          )}
          {post.restack && <Quoted note={post.restack} onOpen={() => onOpenOther(post.restack!.type, post.restack!.id)} />}
          {picture && !broken && (
            <div data-feed-picture className="mt-1 overflow-hidden rounded-xl border">
              <img src={picture} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="max-h-[22rem] w-full object-cover" />
            </div>
          )}
          {/* The latest thought as one reply line; the rest are in its thread. */}
          {post.type !== 'day' && !alone && <GlossLine id={post.id} quiet className="mt-0.5" placeholder={chosen === 'changed' ? 'What you think now, in your own words' : 'Your reply, in your own words'} />}
          {/* Every control keeps its own fixed place: choosing one changes its colour, never the row. */}
          <div data-feed-actions className="-ml-2 flex items-center gap-1 text-muted-foreground">
            {post.type !== 'day' && (
              <button type="button" data-feed-reply onClick={() => openGloss(post.id)}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <MessageCircle className="size-4" /> Reply
              </button>
            )}
            {REACTIONS.filter((one) => post.type !== 'day' || one.value === 'use').map((one) => (
              <Tip key={one.value} label={one.tip}>
                <button type="button" data-feed-reaction={one.value} aria-pressed={chosen === one.value} aria-label={one.label} onClick={() => choose(one.value)}
                  className={cn('flex size-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground', chosen === one.value && 'bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary')}>
                  <one.icon className="size-4" strokeWidth={chosen === one.value ? 2.4 : 2} />
                </button>
              </Tip>
            ))}
            <Tip label="Restack: say it again in your own words, with this quoted under it">
              <button type="button" data-feed-restack aria-label="Restack" aria-pressed={restacking} onClick={() => (chime(restacking ? 'fold' : 'tap'), setRestacking(!restacking))}
                className={cn('flex size-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground', restacking && 'text-foreground')}>
                <Repeat2 className="size-4" />
              </button>
            </Tip>
            <span className="flex-1" />
            {!alone && (
              <button type="button" data-feed-open onClick={onOpen}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <ArrowUpRight className="size-4" /> Open
              </button>
            )}
            <MenuButton small label="More" items={menu} />
          </div>
          {(history.length > 0 || replies) && (
            <p data-feed-history className="flex flex-wrap items-baseline gap-x-1.5 text-control text-muted-foreground">
              {replies && onThread ? (
                <button type="button" data-feed-replies onClick={onThread} className="rounded-sm hover:text-foreground hover:underline">{replies}</button>
              ) : replies && <span data-feed-replies>{replies}</span>}
              {history.map((line, at) => (
                <span key={line} className="flex items-baseline gap-1.5">{(at > 0 || replies) && <span aria-hidden>·</span>}{line}</span>
              ))}
            </p>
          )}
          {restacking && <Restack post={post} onDone={() => setRestacking(false)} onOpen={(id) => onOpenOther('nugget', id)} />}
        </div>
      </div>
    </li>
  )
}

/** The old note under a restack: its account, kind, date and first lines, as a card that opens it. */
function Quoted({ note, onOpen }: { note: NonNullable<FeedPost['restack']> | FeedPost; onOpen?: () => void }): React.JSX.Element {
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

/** Restack: a new gem in your words, the old note quoted under it. ⌘↵ keeps it; it comes first in tomorrow's Feed. */
function Restack({ post, onDone, onOpen }: { post: FeedPost; onDone: () => void; onOpen: (id: string) => void }): React.JSX.Element {
  const [words, setWords] = useState('')
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
