import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Heart } from 'lucide-react'

import { call, splitTags, unloaded, unread, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { useHere } from '@/lib/split'
import { dayjs, num, plural } from '../../../../main/dates'
import type { LikedPost, LikedSide } from '../../../../main/feed'
import { Docked, Page, Tip, openTag, toast, typing } from './ui'
import { RowMenu, copyLinkItem, type MenuItem } from './row-menu'
import { Avatar } from './avatar'
import { openSource } from '@/lib/sources'
import { distinctInitials } from '@/lib/people'
import { dayLinkName } from './day-view'
import { FeedHeading, Post, SideCard, kindWord, written } from './feed-view'

/**
 * Liked: every post you hearted in the Feed, newest like first, in the Feed's
 * own post look, grouped by when you liked it. A strip of the last year's
 * weeks over it, and beside it what you keep liking and what you liked a year
 * ago today. Read a page at a time as you scroll, so three thousand likes
 * cost no more to open than thirty.
 */
const PAGE = 30
type Kept = { rows: { day: string; was: string | null }[]; weight: number | null }
const keyOf = (post: LikedPost): string => `${post.type}:${post.id}`
/** Where a post opens: a question or a page is a gem's row. */
const openType = (post: LikedPost): string => (post.type === 'question' || post.type === 'article' ? 'nugget' : post.type)
const readSide = (): Promise<LikedSide> => call<LikedSide>('feed:liked-side')
const NO_SIDE = unread<LikedSide>({ total: 0, notes: 0, weeks: [], tags: [], sources: [], yearAgo: [], yearAgoExact: false })

/** Monday of this week, the strip's and the groups' week. */
const thisMonday = (): dayjs.Dayjs => dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day')
/** When you liked it, in words: "Liked today", "Liked 3 days ago", then the date. */
export const likedWords = (day: string): string => {
  const days = dayjs().startOf('day').diff(dayjs(day).startOf('day'), 'day')
  return days <= 0 ? 'Liked today' : days === 1 ? 'Liked yesterday' : days < 7 ? `Liked ${days} days ago` : `Liked ${written(day)}`
}
/** Its group: this week, then each month of this year by name, then each year before. */
const groupOf = (day: string): string => {
  const at = dayjs(day)
  if (!at.isBefore(thisMonday())) return 'This week'
  return at.year() === dayjs().year() ? at.format('MMMM') : at.format('YYYY')
}
const likesSaid = (n: number): string => `${plural(n, 'like')}`

export function FeedLiked({ tabs, onOpen }: { tabs: React.ReactNode; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const side = useLive(readSide, NO_SIDE, [], ['capture', 'item'], 'feed-liked-side')
  const [posts, setPosts] = useState<LikedPost[] | null>(null)
  // How far into the list has been read (rows, not posts: a binned note's like is a row with no post).
  const read = useRef(0)
  const [more, setMore] = useState(false)
  const busy = useRef(false)
  const [cursor, setCursor] = useState(-1)
  const [target, setTarget] = useState<{ start: string; end: string } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const here = useHere()

  // Where the list shown starts: 0 from the newest, or a week far back jumped to, read from there.
  const [first, setFirst] = useState(0)
  const load = useCallback(async (count = PAGE, fresh = false, at = 0): Promise<void> => {
    if (busy.current) return
    busy.current = true
    if (fresh) setFirst(at)
    const from = fresh ? at : read.current
    const page = await call<{ posts: LikedPost[]; more: boolean }>('feed:liked', from, count)
    read.current = from + count
    setPosts((was) => (fresh || !was ? page.posts : [...was, ...page.posts.filter((one) => !was.some((it) => keyOf(it) === keyOf(one)))]))
    setMore(page.more)
    busy.current = false
  }, [])
  useEffect(() => void load(PAGE, true), [load])

  // The next page once the foot of the list comes near, never all at once.
  const foot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const end = foot.current
    if (!end || !more) return
    const watch = new IntersectionObserver(([one]) => one?.isIntersecting && void load(), { rootMargin: '600px 0px' })
    watch.observe(end)
    return () => watch.disconnect()
  }, [more, load, posts])

  const open = (post: LikedPost): void => (chime('open'), onOpen(openType(post), post.id))
  const unlike = async (post: LikedPost): Promise<void> => {
    const list = posts ?? []
    const at = list.findIndex((one) => keyOf(one) === keyOf(post))
    chime('away')
    setPosts(list.filter((one) => keyOf(one) !== keyOf(post)))
    const kept = await call<Kept>('feed:unlike', keyOf(post))
    const title = post.type === 'day' ? dayLinkName(post.id) : post.title
    toast('Unliked', () => {
      chime('undo')
      void call('feed:relike', keyOf(post), kept)
      setPosts((was) => { const next = [...(was ?? [])]; next.splice(Math.min(at, next.length), 0, post); return next })
    }, 'success', undefined, { type: openType(post), id: post.id, title })
  }

  // A week clicked in the strip: read on to it if it is near, or else read from that week alone (never every like
  // between), and the first post liked that week (or the nearest before it) comes to the cursor.
  const jump = async (start: string): Promise<void> => {
    chime('page')
    const end = dayjs(start).add(7, 'day').format('YYYY-MM-DD')
    const offset = await call<number>('feed:liked-at', end)
    if (offset < first || offset > read.current + PAGE) await load(PAGE, true, offset)
    else if (offset + PAGE > read.current) await load(offset + PAGE - read.current)
    setTarget({ start, end })
  }
  useLayoutEffect(() => {
    if (!target || !posts) return
    const at = posts.findIndex((one) => one.likedOn < target.end)
    setTarget(null)
    if (at < 0) return
    setCursor(at)
    root.current?.querySelector(`[data-liked-row="${at}"]`)?.scrollIntoView({ block: 'start' })
  }, [target, posts])

  // J and K move, L unlikes, Enter opens: the list's own keys, as Close the day's.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!here() || !posts?.length || typing() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const by = event.code === 'KeyJ' || event.key === 'ArrowDown' ? 1 : event.code === 'KeyK' || event.key === 'ArrowUp' ? -1 : 0
      if (by) {
        event.preventDefault()
        const next = Math.max(0, Math.min(posts.length - 1, cursor + by))
        setCursor(next)
        root.current?.querySelector(`[data-liked-row="${next}"]`)?.scrollIntoView({ block: 'nearest' })
        return
      }
      const post = posts[cursor]
      if (!post) return
      if (event.code === 'KeyL') (event.preventDefault(), void unlike(post))
      else if (event.key === 'Enter' && !(event.target as HTMLElement | null)?.closest?.('button, a, [role="link"]')) (event.preventDefault(), open(post))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const menuOf = (post: LikedPost): MenuItem[] => [
    { id: 'open', label: 'Open', icon: <ArrowUpRight className="size-4" />, run: () => open(post) },
    { id: 'unlike', label: 'Unlike', hint: 'Take it out of Liked', keys: 'L', icon: <Heart className="size-4" />, run: () => void unlike(post) },
    copyLinkItem(post.type === 'capture' ? post.id : post.type === 'day' ? `day:${post.id}` : `nugget:${post.id}`, post.type === 'day' ? dayLinkName(post.id) : post.title)
  ]

  const waiting = posts === null || unloaded(side)
  // Always a line, so the tabs under it sit where Notes' and Reading's do.
  const lead = <span data-liked-holds className="truncate text-control text-muted-foreground">{side.total ? `${likesSaid(side.total)} on ${plural(side.notes, 'post')}` : 'No likes yet'}</span>
  return (
    <Page title="Feed" dock waiting={waiting} lead={lead}>
      {/* The likes scroll by themselves; the side column is docked at the page's right edge, full height. */}
      <Docked side={side.total > 0 ? <LikedSideColumn side={side} onOpen={open} /> : null}>
      <div ref={root} data-feed-liked className="flex min-w-0 flex-col px-5 pt-[33px] pb-16">
          {tabs}
          {!posts?.length && !side.total ? (
            <p data-liked-empty className="py-10 text-body text-foreground">Nothing liked yet. Tap the heart on a post in Notes and it is kept here, the newest first.</p>
          ) : (
            <>
              {side.weeks.length > 0 && <WeekStrip weeks={side.weeks} onWeek={(start) => void jump(start)} />}
              {first > 0 && (
                <button type="button" data-liked-newest onClick={() => (chime('page'), void load(PAGE, true, 0))}
                  className="mt-4 flex h-8 w-fit items-center gap-1.5 self-center rounded-md border px-3 text-control font-medium text-foreground transition-colors hover:bg-foreground/[0.05]">
                  Back to the newest likes
                </button>
              )}
              <ol className="flex flex-col">
                {(posts ?? []).map((post, at) => {
                  const group = groupOf(post.likedOn)
                  const heading = at === 0 || groupOf(posts![at - 1].likedOn) !== group
                  return (
                    <li key={keyOf(post)} className="flex flex-col">
                      {heading && <FeedHeading data-liked-group={group}>{group}</FeedHeading>}
                      <RowMenu items={menuOf(post)}>
                        <div data-liked-row={at} data-liked-key={keyOf(post)} data-liked-day={post.likedOn} data-liked-focus={at === cursor || undefined}
                          onPointerDown={() => setCursor(at)}
                          className={cn('-mx-3 rounded-lg px-3 pt-4 transition-colors', at === cursor && 'bg-accent/30 ring-1 ring-foreground/10')}>
                          {post.type === 'day' ? (
                            <LikedDay post={post} onOpen={() => open(post)} onUnlike={() => void unlike(post)} />
                          ) : (
                            <ol className="flex flex-col"><Post post={post} onOpen={() => open(post)} onOpenOther={(type, id) => (chime('open'), onOpen(type, id))}
                              likedLine={likedWords(post.likedOn)} onUnlike={() => void unlike(post)} /></ol>
                          )}
                        </div>
                      </RowMenu>
                    </li>
                  )
                })}
              </ol>
              <div ref={foot} data-liked-foot={more ? 'more' : 'end'} className="flex justify-center py-10 text-body text-muted-foreground">
                {more ? 'Loading more…' : posts?.length ? `That is every post you liked, back to ${written(posts.at(-1)!.likedOn, true)}.` : null}
              </div>
            </>
          )}
      </div>
      </Docked>
    </Page>
  )
}

/** A Journal day you liked, on its own line: "You liked the day: 25 Oct". */
function LikedDay({ post, onOpen, onUnlike }: { post: LikedPost; onOpen: () => void; onUnlike: () => void }): React.JSX.Element {
  return (
    <div data-liked-day-row className="flex items-center gap-3 border-b pb-4">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/60 text-[var(--tt-color-text-red)]"><Heart className="size-4" fill="currentColor" /></span>
      <p className="min-w-0 flex-1 text-body text-foreground">
        You liked the day:{' '}
        <button type="button" data-liked-day-open onClick={onOpen} className="rounded-sm font-semibold underline-offset-2 hover:underline">{written(post.id)}</button>
        <span className="block text-control text-muted-foreground">{likedWords(post.likedOn)}{post.likes >= 2 ? ` · liked ${num(post.likes)} times` : ''}</span>
      </p>
      <Tip label="Unlike: take it out of Liked">
        <button type="button" data-feed-reaction="like" aria-pressed aria-label="Unlike" onClick={onUnlike}
          className="flex size-7 items-center justify-center rounded-md text-[var(--tt-color-text-red)] transition-colors hover:bg-foreground/[0.06]">
          <Heart className="size-4" fill="currentColor" />
        </button>
      </Tip>
    </div>
  )
}

/**
 * Likes each week over the last year, one mark a week, newest on the right:
 * what it shows in words above it, the months under it, and a click on a week
 * takes the list there.
 */
function WeekStrip({ weeks, onWeek }: { weeks: LikedSide['weeks']; onWeek: (start: string) => void }): React.JSX.Element {
  const most = Math.max(1, ...weeks.map((one) => one.n))
  const year = weeks.reduce((sum, one) => sum + one.n, 0)
  const top = weeks.reduce((best, one) => (one.n > best.n ? one : best), weeks[0])
  const point = !year ? 'No likes in the last year' : `${likesSaid(year)} in the last year, the most in the week of ${written(top.start)} (${num(top.n)})`
  return (
    <section data-liked-strip aria-label="Likes each week, the last year" data-chart="liked-weeks" className="mb-2 rounded-[6px] border bg-card px-3 pt-3 pb-2">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-control">
        <span className="font-semibold text-foreground">Likes each week, the last year</span>
        <span data-liked-point className="text-foreground/80">{point}</span>
      </p>
      <div className="mt-3 flex h-12 items-end gap-[2px]">
        {weeks.map((one) => (
          <Tip key={one.start} label={`Week of ${written(one.start, true)}: ${likesSaid(one.n)}`}>
            <button type="button" data-liked-week={one.start} data-liked-week-n={one.n} disabled={!one.n} onClick={() => onWeek(one.start)}
              className="group flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center disabled:cursor-default">
              {/* Pills of the one ink every chart uses, lighter at rest and full under the pointer; a week with none a faint stub. */}
              <span {...(one.n ? { 'data-mark': '' } : {})} className={cn('block w-full max-w-1.5 rounded-full transition-opacity', one.n ? 'bg-foreground opacity-75 group-hover:opacity-100' : 'bg-foreground/10')}
                style={{ height: one.n ? `max(6px, ${(one.n / most) * 100}%)` : '2px' }} />
            </button>
          </Tip>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-[2px] text-meta text-muted-foreground">
        {weeks.map((one, at) => {
          const month = dayjs(one.start).add(3, 'day')
          const first = at > 0 && month.month() !== dayjs(weeks[at - 1].start).add(3, 'day').month()
          return <span key={one.start} className="relative h-4 min-w-0 flex-1">{first && <span className="absolute left-0 whitespace-nowrap">{month.format('MMM')}</span>}</span>
        })}
      </div>
      {/* The year on its own line, once where the strip starts and again under each January, so a month name never runs into it. */}
      <div aria-hidden data-liked-years className="flex gap-[2px] text-meta font-medium text-foreground/70">
        {weeks.map((one, at) => {
          const month = dayjs(one.start).add(3, 'day')
          const year = at === 0 || month.year() !== dayjs(weeks[at - 1].start).add(3, 'day').year()
          return <span key={one.start} className="relative h-4 min-w-0 flex-1">{year && <span className="absolute left-0 whitespace-nowrap">{month.format('YYYY')}</span>}</span>
        })}
      </div>
    </section>
  )
}

/** Beside Liked: what you keep liking (tags, sources), and what you liked a year ago today. */
function LikedSideColumn({ side, onOpen }: { side: LikedSide; onOpen: (post: LikedPost) => void }): React.JSX.Element {
  const row = 'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-control text-foreground transition-colors hover:bg-accent/60'
  const letters = distinctInitials(side.sources.map((one) => one.name))
  return (
    <aside data-liked-side aria-label="Beside Liked" className="page-dock-side">
      {side.yearAgo.length > 0 && (
        <SideCard name="year-ago" title={side.yearAgoExact ? 'You liked a year ago today' : 'You liked a year ago this week'}>
          {side.yearAgo.map((post) => (
            <button key={keyOf(post)} type="button" data-liked-year-ago={keyOf(post)} onClick={() => onOpen(post)} className={cn(row, 'flex-col items-start gap-0.5')}>
              <span className="line-clamp-2 font-medium hyphens-auto [overflow-wrap:break-word]">{post.type === 'day' ? `The day: ${written(post.id, true)}` : post.kind === 'quote' ? `“${(post.text || post.title).slice(0, 90)}”` : splitTags(post.title).text || post.title}</span>
              <span className="text-muted-foreground">{kindWord(post)}{post.who ? ` · ${post.who}` : ''} · {written(post.likedOn, true)}</span>
            </button>
          ))}
        </SideCard>
      )}
      {(side.tags.length > 0 || side.sources.length > 0) && (
        <SideCard name="keep-liking" title="What you keep liking">
          {side.tags.map((one) => (
            <button key={one.tag} type="button" data-liked-tag={one.tag} onClick={() => (chime('page'), openTag(one.tag))} className={row}>
              <span aria-hidden className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">#</span>
              <span className="min-w-0 flex-1 truncate">{one.tag}</span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{likesSaid(one.n)}</span>
            </button>
          ))}
          {side.sources.map((one) => (
            <button key={one.name} type="button" data-liked-source={one.name} onClick={() => (chime('page'), openSource('attribution', one.name))} className={row}>
              <Avatar name={one.name} size={20} letters={letters.get(one.name.trim())} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{one.name}</span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{likesSaid(one.n)}</span>
            </button>
          ))}
        </SideCard>
      )}
    </aside>
  )
}
