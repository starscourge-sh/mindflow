import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { byKeys } from '@/lib/motion'
import { NEWS, NEWS_VERSION, SEEN_NEWS, type News } from '@/lib/whats-new'
import { useOnboarding } from '@/lib/onboarding'
import { SANDBOX } from '@/lib/sandbox'
import { Button } from '@/components/ui/button'
import { Kbd, Pressed } from './ui'
import { showMe } from './powers-view'
import { dayjs } from '../../../../main/dates'

/**
 * What's new after an update, the way GitHub's changelog reads: a timeline of
 * dated entries, each a bold lead-in and one sentence, with Show me to go
 * there. Fed from lib/whats-new.ts. Home shows what came since you last
 * looked, once; ⌘K and the Vigil menu open the whole timeline any time.
 */

const seenId = (): string | null => {
  try {
    return localStorage.getItem(SEEN_NEWS)
  } catch {
    return null
  }
}
const markSeen = (): void => {
  try {
    localStorage.setItem(SEEN_NEWS, NEWS[0].id)
  } catch {
    // Shown again next time, then.
  }
}

/** The entries since the newest one you saw; none when you are up to date. */
export function unseenNews(seen = seenId()): News[] {
  const at = seen ? NEWS.findIndex((one) => one.id === seen) : -1
  return at < 0 ? NEWS.slice(0, 6) : NEWS.slice(0, at)
}

/** Open the whole timeline: from ⌘K, the Vigil menu or the card. */
export const openWhatsNew = (): void => void window.dispatchEvent(new CustomEvent('vigil:whats-new'))

/** One entry on the timeline: the day at the left, a dot on the line, the words and Show me. */
function Entry({ news, first, onShow }: { news: News; first: boolean; onShow: (news: News) => void }): React.JSX.Element {
  return (
    <li data-news={news.id} className="group/news relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0">
      <time dateTime={news.day} className={`pt-0.5 text-right text-xs tabular-nums ${first ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{dayjs(news.day).format('D MMM')}</time>
      <div className="relative pl-5">
        {/* The line down the timeline, and this entry's dot on it. */}
        <span aria-hidden className="absolute top-0 -bottom-5 left-[3px] w-px bg-border group-last/news:hidden" />
        <span aria-hidden className="absolute top-[0.4rem] left-0 size-[7px] rounded-full border border-background" style={{ background: first ? 'var(--tt-brand-color-400)' : 'var(--muted-foreground)' }} />
        <p className="text-body leading-snug text-foreground">
          <strong className="font-semibold">{news.lead}</strong> <span className="text-muted-foreground">{news.text}</span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-control" onClick={() => onShow(news)}>Show me</Button>
          {news.keys?.map((keys) => <Pressed key={keys} keys={keys} />)}
        </div>
      </div>
    </li>
  )
}

function Timeline({ list, onShow }: { list: News[]; onShow: (news: News) => void }): React.JSX.Element {
  return (
    <ol className="flex flex-col">
      {list.map((news, at) => <Entry key={news.id} news={news} first={at === 0} onShow={onShow} />)}
    </ol>
  )
}

/**
 * On Home after an update, once: what came since you last looked. Put away
 * with its ×, or by opening the whole list, and not back until something new
 * is added. A new copy of Vigil starts up to date, with nothing to say.
 */
export function WhatsNewCard({ onView }: { onView: (id: string, focus?: string) => void }): React.JSX.Element | null {
  const state = useOnboarding()
  const [seen, setSeen] = useState(seenId)
  // First run: nothing was updated, so the newest counts as seen.
  useEffect(() => {
    if (state && !state.welcomed && !seen && !SANDBOX) {
      markSeen()
      setSeen(NEWS[0].id)
    }
  }, [state, seen])
  // Put away from the sheet too.
  useEffect(() => {
    const again = (): void => setSeen(seenId())
    window.addEventListener('vigil:news-seen', again)
    return () => window.removeEventListener('vigil:news-seen', again)
  }, [])
  if (!state || SANDBOX || !state.welcomed) return null
  const list = unseenNews(seen).slice(0, 3)
  if (!list.length) return null
  const away = (): void => {
    chime('fold')
    markSeen()
    setSeen(NEWS[0].id)
  }
  return (
    <section data-whats-new-card aria-label="What's new" className={`mx-3 rounded-xl border bg-background p-4 @[44rem]/page:mx-6 ${byKeys() ? '' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-300'}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-heading font-semibold text-foreground">What's new in Vigil</h2>
        <span className="text-meta text-muted-foreground">{NEWS_VERSION}</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => (markSeen(), setSeen(NEWS[0].id), openWhatsNew())}>See everything</Button>
        <button type="button" aria-label="Put this away" onClick={away} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <Timeline list={list} onShow={(news) => (markSeen(), setSeen(NEWS[0].id), void showMe({ name: news.lead.replace(/\.$/, ''), keys: news.keys, show: news.show }, onView))} />
    </section>
  )
}

/** The whole timeline, over the window, from ⌘K or the Vigil menu. Esc closes it. */
export function WhatsNewSheet({ onView }: { onView: (id: string, focus?: string) => void }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const ask = (): void => {
      chime('open')
      markSeen()
      window.dispatchEvent(new CustomEvent('vigil:news-seen'))
      setOpen(true)
    }
    window.addEventListener('vigil:whats-new', ask)
    return () => window.removeEventListener('vigil:whats-new', ask)
  }, [])
  const close = (): void => (chime('fold'), setOpen(false))
  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="What's new"
        data-whats-new
        className={`flex max-h-[80vh] w-[min(38rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-(--mf-panel-shadow) ${byKeys() ? '' : 'animate-in fade-in-0 zoom-in-[0.98] duration-200'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <h2 className="font-heading text-heading font-semibold text-foreground">What's new</h2>
          <span className="text-meta text-muted-foreground">Vigil {NEWS_VERSION}</span>
          <span className="flex-1" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <Timeline list={NEWS} onShow={(news) => (setOpen(false), void showMe({ name: news.lead.replace(/\.$/, ''), keys: news.keys, show: news.show }, onView))} />
        </div>
      </div>
    </div>
  )
}
