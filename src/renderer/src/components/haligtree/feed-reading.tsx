import { useState } from 'react'
import { ArrowUpRight, MessageCircle, Repeat2 } from 'lucide-react'

import { call, unloaded, unread, useLive } from '@/lib/haligtree'
import { useThumb } from '@/lib/notes'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { dayjs, num } from '../../../../main/dates'
import type { Reading, ReadingPage } from '../../../../main/feed'
import { Page } from './ui'
import { openGloss } from './gloss-line'
import { GroupIcon } from './kept-groups'
import { TagIcon } from './tag-icon'
import { ReadThrough } from './read-through'
import { Restack, TabChips } from './feed-view'

/**
 * Reading: your Pages as a list of essays to read, the way a reading app
 * lists the posts you follow: where each is from, its title and first line,
 * how long it takes, and its picture. The one longest unread comes first,
 * and one a day is "Today's read".
 */
const readReading = (): Promise<Reading> => call<Reading>('feed:reading')
const NO_READING = unread<Reading>({ day: '', today: null, pages: [], safe: false })

type Shelf = 'all' | 'unread' | 'saved' | 'history'
type Order = 'priority' | 'newest'
const SHELF = 'feedReadingShelf'
const ORDER = 'feedReadingOrder'
const kept = <T extends string>(key: string, fallback: T, allowed: T[]): T => {
  try {
    const value = localStorage.getItem(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}
const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Remembered while the window is open.
  }
}
/** Unread: not opened in the last ninety days, or never. */
const UNREAD_DAYS = 90
const unreadNow = (page: ReadingPage): boolean => !page.opened || dayjs().diff(dayjs(page.opened), 'day') >= UNREAD_DAYS
const written = (at: string): string => dayjs(at).format(dayjs(at).year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY')

export function FeedReading({ tabs, onOpen }: { tabs: React.ReactNode; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const read0 = useLive(readReading, NO_READING, [], ['item'], 'feed-reading')
  // Pages opened here count as read at once: on to History, out of Unread.
  const [openedHere, setOpenedHere] = useState<Record<string, string>>({})
  const reading = { ...read0, pages: read0.pages.map((one) => (openedHere[one.id] ? { ...one, opened: openedHere[one.id] } : one)) }
  const anySaved = reading.pages.some((one) => one.saved)
  const shelves: { value: Shelf; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    ...(anySaved ? [{ value: 'saved' as const, label: 'Saved' }] : []),
    { value: 'history', label: 'History' }
  ]
  const [shelf, setShelf] = useState<Shelf>(() => kept(SHELF, 'all', ['all', 'unread', 'saved', 'history']))
  const [order, setOrder] = useState<Order>(() => kept(ORDER, 'priority', ['priority', 'newest']))
  const [open, setOpen] = useState<string | null>(null)
  // A line chosen while reading, put into a restack under the page.
  const [line, setLine] = useState<string | null>(null)
  const on = shelf === 'saved' && !anySaved ? 'all' : shelf
  const today = reading.pages.find((one) => one.id === reading.today)
  const list = (() => {
    const pages = reading.pages.filter((one) => (on === 'unread' ? unreadNow(one) : on === 'saved' ? one.saved : on === 'history' ? !!one.opened && !unreadNow(one) : true))
    // History is what you read, newest first; the rest follow the order chosen.
    if (on === 'history') return [...pages].sort((a, b) => b.opened!.localeCompare(a.opened!))
    return order === 'newest' ? [...pages].sort((a, b) => b.made.localeCompare(a.made)) : pages
  })()
  // Today's read stands over the list on "All", once.
  const rows = on === 'all' && today ? list.filter((one) => one.id !== today.id) : list
  const reader = reading.pages.find((one) => one.id === open)
  const read = (page: ReadingPage): void => {
    // Opened here counts as read, as opening it anywhere does.
    void call('home:opened', 'article', page.id)
    setLine(null)
    setOpen(page.id)
    setOpenedHere((all) => ({ ...all, [page.id]: new Date().toISOString() }))
  }
  const close = (): void => (setOpen(null), setLine(null))
  return (
    <Page title="Feed" waiting={unloaded(read0)} count={reading.pages.length || undefined} unit={['page to read', 'pages to read']}>
      <div data-feed data-feed-reading className="flex flex-col px-5 pt-[33px] pb-16">
        {tabs}
        {reading.safe ? (
          <p data-feed-safe className="py-10 text-body text-foreground"><strong className="font-semibold">Safe mode is on</strong>, so Reading rests until you turn it off.</p>
        ) : !reading.pages.length ? (
          <p data-reading-empty className="py-10 text-body text-foreground">Nothing to read yet. Write a Page and it comes back to you here.</p>
        ) : (
          <div className="flex max-w-[44rem] flex-col">
            {/* The shelves on the left, the order on the right: each in its own fixed place. */}
            <div className="mb-4 flex items-center gap-3">
              <TabChips name="reading" tabs={shelves} value={on} onChange={(next) => (setShelf(next), keep(SHELF, next))} />
              <span className="flex-1" />
              {on !== 'history' && (
                <TabChips name="reading-order" tabs={[{ value: 'priority', label: 'Priority' }, { value: 'newest', label: 'Newest' }]} value={order} onChange={(next) => (setOrder(next), keep(ORDER, next))} />
              )}
            </div>
            {on === 'all' && today && (
              <section data-reading-today className="mb-2 border-b pb-2">
                <p className="mb-1 text-control font-semibold text-foreground">Today's read</p>
                <Row page={today} big onRead={() => read(today)} />
              </section>
            )}
            {rows.length ? (
              <ol className="flex flex-col">
                {rows.map((page) => <li key={page.id} className="border-b last:border-b-0"><Row page={page} onRead={() => read(page)} /></li>)}
              </ol>
            ) : (
              <p data-reading-none className="py-8 text-body text-foreground">{on === 'history' ? 'Nothing read lately. Pages you open show here, the newest first.' : on === 'saved' ? 'Nothing saved.' : 'All read. Every Page has been opened in the last 90 days.'}</p>
            )}
          </div>
        )}
      </div>
      {reader && (
        <ReadThrough key={reader.id} items={[{ type: 'article', id: reader.id }]} onClose={close}
          longform={{
            dek: reader.dek,
            minutes: reader.minutes,
            made: reader.made,
            onLine: setLine,
            foot: (
              <div className="flex flex-col gap-3">
                <div data-reading-actions className="flex items-center gap-1 border-y py-2 text-muted-foreground">
                  <button type="button" data-reading-reply onClick={() => (chime('tap'), openGloss(reader.id))}
                    className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                    <MessageCircle className="size-4" /> Reply
                  </button>
                  <button type="button" data-reading-restack aria-pressed={line !== null}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (line !== null) return void (chime('fold'), setLine(null))
                      chime('tap')
                      setLine(window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '')
                    }}
                    className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground', line !== null && 'text-foreground')}>
                    <Repeat2 className="size-4" /> Restack
                  </button>
                  <span className="flex-1" />
                  <button type="button" data-reading-edit onClick={() => (chime('open'), close(), onOpen('article', reader.id))}
                    className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-control transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                    <ArrowUpRight className="size-4" /> Open to edit
                  </button>
                </div>
                {line !== null && (
                  <Restack post={{ type: 'article', id: reader.id, kind: 'note', title: reader.title, text: reader.dek, who: null }} initial={line}
                    onDone={() => setLine(null)} onOpen={(id) => (close(), onOpen('nugget', id))} />
                )}
              </div>
            )
          }} />
      )}
    </Page>
  )
}

/** One essay: where it is from, its title, its first line, how long and when, and its picture on the right. */
function Row({ page, big = false, onRead }: { page: ReadingPage; big?: boolean; onRead: () => void }): React.JSX.Element {
  const thumb = useThumb(page.id)
  const picture = thumb && !/\.(mp4|m4v|mov|webm)$/i.test(thumb) ? thumb : undefined
  const [broken, setBroken] = useState(false)
  return (
    <button type="button" data-reading-row={page.id} data-reading-unread={unreadNow(page) || undefined} onClick={() => (chime('open'), onRead())}
      className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-4 rounded-lg px-2 py-4 text-left transition-colors hover:bg-foreground/[0.03]">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {page.from && (
          <span data-reading-from className="flex min-w-0 items-center gap-1.5 text-control text-muted-foreground">
            {page.from.kind === 'group' ? <GroupIcon icon={page.from.icon} color={page.from.color} className="size-3.5" /> : <TagIcon tag={page.from.name} className="size-3.5" />}
            <span className="truncate font-medium text-foreground/80">{page.from.kind === 'tag' ? `#${page.from.name}` : page.from.name}</span>
          </span>
        )}
        <span data-reading-title className={cn('font-heading font-semibold tracking-[-0.01em] text-balance text-foreground group-hover:underline group-hover:decoration-foreground/30 group-hover:underline-offset-4', big ? 'text-[1.375rem] leading-tight' : 'text-[1.0625rem] leading-snug')}>{page.title}</span>
        {page.dek && <span data-reading-dek className={cn('font-serif text-muted-foreground', big ? 'line-clamp-3 text-[1.0625rem] leading-relaxed' : 'line-clamp-2 text-body leading-relaxed')}>{page.dek}</span>}
        <span className="mt-0.5 flex items-center gap-1.5 text-control text-muted-foreground tabular-nums">
          <span data-reading-minutes>{num(page.minutes)} min read</span>
          <span aria-hidden>·</span>
          <time dateTime={page.made}>{written(page.made)}</time>
        </span>
      </span>
      {picture && !broken && (
        <span data-reading-picture className={cn('shrink-0 overflow-hidden rounded-md border bg-accent/30', big ? 'size-28' : 'size-20')}>
          <img src={picture} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="size-full object-cover" />
        </span>
      )}
    </button>
  )
}
