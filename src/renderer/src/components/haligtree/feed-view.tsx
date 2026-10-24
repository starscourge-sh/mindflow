import { useEffect, useState } from 'react'
import { ArrowUpRight, MessageCircle } from 'lucide-react'

import { call, splitTags, unloaded, unread, useLive } from '@/lib/haligtree'
import { useThumb } from '@/lib/notes'
import { noteLinkText } from '@/lib/capture-links'
import { chime } from '@/lib/sound'
import { dayjs, num } from '../../../../main/dates'
import type { Feed, FeedPost } from '../../../../main/feed'
import { Page } from './ui'
import { Avatar } from './avatar'
import { GlossLine, openGloss } from './gloss-line'
import { MenuButton } from './collection-header'
import { copy } from './row-menu'

/**
 * The Feed: the day's twenty or so of your own things, as posts in a
 * timeline. Each post's account is where it came from: a quote's author, or
 * you. It ends: once you reach the bottom you are caught up until tomorrow.
 */
const readFeed = (): Promise<Feed> => call<Feed>('feed')
const NO_FEED = unread<Feed>({ day: '', posts: [], safe: false })

const KIND_WORD: Record<FeedPost['type'], string> = { nugget: 'Gem', capture: 'Note', article: 'Page', question: 'Question', day: 'Journal' }
const kindWord = (post: FeedPost): string => (post.kind === 'quote' ? 'Quote' : KIND_WORD[post.type])

/** The date it was written: "4 Mar", with the year once it is not this year's. */
const written = (at: string): string => {
  const when = dayjs(at)
  return when.format(when.year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')
}

/** The line over a post, when there is one: from long ago, or one you have replied to. */
const contextOf = (post: FeedPost): string | null => {
  const last = post.seen ?? post.made
  const made = dayjs(post.made)
  if (made.format('MM-DD') === dayjs().format('MM-DD') && made.year() < dayjs().year()) return dayjs().year() - made.year() === 1 ? 'A year ago today' : `${dayjs().year() - made.year()} years ago today`
  if (dayjs().diff(dayjs(last), 'day') >= 365) return 'From the archives'
  if (post.gloss) return `You replied to this in ${dayjs(post.gloss.at).format(dayjs(post.gloss.at).year() === dayjs().year() ? 'MMMM' : 'MMMM YYYY')}`
  return null
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

export function FeedView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const feed = useLive(readFeed, NO_FEED, [], ['capture', 'item'], 'feed')
  const until = useUntilTomorrow()
  const open = (post: FeedPost): void => (chime('open'), onOpen(post.type, post.id))
  const counts = feed.posts.reduce<Record<string, number>>((all, post) => ({ ...all, [kindWord(post)]: (all[kindWord(post)] ?? 0) + 1 }), {})
  const said = Object.entries(counts).map(([word, n]) => `${num(n)} ${word === 'Journal' ? (n === 1 ? 'Journal day' : 'Journal days') : n === 1 ? word.toLowerCase() : `${word.toLowerCase()}s`}`)
  const summary = said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)}` : said[0]
  return (
    <Page title="Feed" waiting={unloaded(feed)} count={feed.posts.length || undefined} unit={['post today', 'posts today']}>
      <div data-feed className="flex flex-col px-5 pt-[33px] pb-16">
        {feed.safe ? (
          <p data-feed-safe className="py-10 text-body text-foreground"><strong className="font-semibold">Safe mode is on</strong>, so the Feed rests until you turn it off.</p>
        ) : !feed.posts.length ? (
          <p data-feed-empty className="py-10 text-body text-foreground">Nothing to show yet. Keep a gem, a quote or a question, and it comes back to you here.</p>
        ) : (
          <>
            <ol className="flex flex-col">
              {feed.posts.map((post) => <Post key={`${post.type}:${post.id}`} post={post} onOpen={() => open(post)} />)}
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

function Post({ post, onOpen }: { post: FeedPost; onOpen: () => void }): React.JSX.Element {
  const quote = post.kind === 'quote'
  const account = (quote && post.who) || 'You'
  const context = contextOf(post)
  const thumb = useThumb(post.type === 'day' ? '' : post.id)
  const picture = thumb && !/\.(mp4|m4v|mov|webm)$/i.test(thumb) ? thumb : undefined
  const [broken, setBroken] = useState(false)
  const words = quote ? post.text || post.title : post.text
  const link = post.type === 'capture' ? post.id : `${post.type === 'question' ? 'nugget' : post.type}:${post.id}`
  const menu = [
    { label: 'Open', run: onOpen },
    post.type !== 'day' && { label: 'Copy link', hint: 'Paste it into any note to link here', run: () => copy(noteLinkText(link, post.title), 'Copied a link: paste it into any note') }
  ]
  const title = post.type === 'day' ? dayjs(post.id).format(dayjs(post.id).year() === dayjs().year() ? 'dddd D MMMM' : 'dddd D MMMM YYYY') : splitTags(post.title).text || post.title
  return (
    <li data-feed-post={post.type} data-feed-id={post.id} data-feed-kind={post.kind} className="flex flex-col gap-1 border-b py-4 first:pt-0 last:border-b-0">
      {context && <p data-feed-context className="pl-12 text-control text-muted-foreground">{context}</p>}
      <div className="flex gap-3">
        <Avatar name={account} size={36} className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 items-baseline gap-1.5 text-control">
            <span data-feed-account className="truncate font-semibold text-foreground">{account}</span>
            <span className="shrink-0 text-muted-foreground">{kindWord(post)}</span>
            <span aria-hidden className="shrink-0 text-muted-foreground">·</span>
            <time dateTime={post.made} className="shrink-0 text-muted-foreground tabular-nums">{written(post.made)}</time>
          </p>
          {quote ? (
            <figure data-feed-quote className="rounded-lg border bg-accent/25 px-4 py-3">
              <blockquote className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground line-clamp-[10]">{words}</blockquote>
              {post.who && <figcaption data-feed-author className="mt-2 text-control font-medium text-foreground/80">{post.who}</figcaption>}
            </figure>
          ) : (
            <>
              <p className="text-body font-semibold [overflow-wrap:anywhere] text-foreground">{title}</p>
              {post.type !== 'question' && post.text && <p className="line-clamp-[8] text-body leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] text-foreground/90">{post.text}</p>}
            </>
          )}
          {picture && !broken && (
            <div data-feed-picture className="mt-1 overflow-hidden rounded-xl border">
              <img src={picture} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="max-h-[22rem] w-full object-cover" />
            </div>
          )}
          {post.type !== 'day' && <GlossLine id={post.id} quiet className="mt-0.5" placeholder="Your reply, in your own words" />}
          {/* Reply, then room for what comes next (reactions, restack), then Open and ⋯ at the end: none moves when another arrives. */}
          <div data-feed-actions className="-ml-2 flex items-center gap-1 text-muted-foreground">
            {post.type !== 'day' && (
              <button type="button" data-feed-reply onClick={() => openGloss(post.id)}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <MessageCircle className="size-4" /> Reply
              </button>
            )}
            <span className="flex-1" />
            <button type="button" data-feed-open onClick={onOpen}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
              <ArrowUpRight className="size-4" /> Open
            </button>
            <MenuButton small label="More" items={menu} />
          </div>
        </div>
      </div>
    </li>
  )
}
