import { useEffect, useState } from 'react'
import { useReading } from '@/lib/reads-in'
import { X } from 'lucide-react'
import { chime } from '@/lib/sound'
import { useByKeys } from '@/lib/motion'
import { NEWS, NEWS_VERSION, RELEASES, SEEN_NEWS, type News } from '@/lib/whats-new'
import { useOnboarding } from '@/lib/onboarding'
import { SANDBOX } from '@/lib/sandbox'
import { Button } from '@/components/ui/button'
import { Page, Pressed } from './ui'
import { showMe } from './powers-view'
import { dated, dayjs } from '../../../../main/dates'
import { APP_NAME } from '../../../../main/name'

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

/** Open the What's new pages: from ⌘K, the Vigil menu or the card. The main window listens. */
export const openWhatsNew = (): void => void window.dispatchEvent(new CustomEvent('vigil:whats-new'))

/** One entry on the timeline: the day at the left, a dot on the line, the words and Show me. */
function Entry({ news, first, onShow }: { news: News; first: boolean; onShow: (news: News) => void }): React.JSX.Element {
  return (
    <li data-news={news.id} className="group/news relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0">
      <time dateTime={news.day} className={`pt-0.5 text-right text-xs tabular-nums ${first ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{dated(news.day)}</time>
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
  useReading(!state)
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
  // Reached by a key it is simply there, read once: a click on it never plays the entrance after.
  const keyed = useByKeys(true)
  if (!state || SANDBOX || !state.welcomed) return null
  const list = unseenNews(seen).slice(0, 3)
  if (!list.length) return null
  const away = (): void => {
    chime('fold')
    markSeen()
    setSeen(NEWS[0].id)
  }
  return (
    <section data-whats-new-card aria-label="What's new" className={`mx-3 rounded-xl border bg-background p-4 @[44rem]/page:mx-6 ${keyed ? '' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-300'}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-heading text-heading font-semibold text-foreground">What's new in {APP_NAME}</h2>
        <span className="text-meta text-muted-foreground">{NEWS_VERSION}</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-control" onClick={() => (chime('page'), markSeen(), setSeen(NEWS[0].id), onView('whatsnew'))}>See everything</Button>
        <button type="button" aria-label="Put this away" onClick={away} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <Timeline list={list} onShow={(news) => (markSeen(), setSeen(NEWS[0].id), void showMe({ name: news.lead.replace(/\.$/, ''), keys: news.keys, show: news.show }, onView))} />
    </section>
  )
}

/**
 * What's new as built-in pages: one dated page a release, shipped with the
 * app and read only, never in your lists or search. The releases down the
 * side, the one open beside them, each entry with its Show me. Reached from
 * the card on Home, ⌘K and the Vigil menu.
 */
export function WhatsNewPage({ focus, onView }: { focus?: string; onView: (id: string, focus?: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(() => RELEASES.find((one) => one.id === focus)?.id ?? RELEASES[0].id)
  useEffect(() => void (focus && RELEASES.some((one) => one.id === focus) && setOpen(focus)), [focus])
  useEffect(() => (markSeen(), void window.dispatchEvent(new CustomEvent('vigil:news-seen'))), [])
  const release = RELEASES.find((one) => one.id === open)!
  const list = NEWS.filter((one) => one.release === open)
  return (
    <Page title="What's new">
      <div data-whats-new className="mx-auto flex w-full max-w-4xl gap-8 px-6 pt-6 pb-16">
        <nav aria-label="Releases" className="hidden w-48 shrink-0 flex-col gap-0.5 @[44rem]/page:flex">
          {RELEASES.map((one) => (
            <button key={one.id} type="button" data-release={one.id} aria-current={one.id === open ? 'page' : undefined}
              onClick={() => (chime('page'), setOpen(one.id))}
              className={`flex flex-col items-start rounded-md px-2.5 py-1.5 text-left transition-colors ${one.id === open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}>
              <span className="text-xs tabular-nums">{dayjs(one.day).format('D MMMM YYYY')}</span>
              <span className="text-control font-medium">{one.title}</span>
            </button>
          ))}
        </nav>
        <article data-release-page={open} className="min-w-0 flex-1">
          <p className="text-meta text-muted-foreground tabular-nums">{dayjs(release.day).format('D MMMM YYYY')}{release.version ? ` · ${APP_NAME} ${release.version}` : ''}</p>
          <h1 className="mt-1 font-heading text-[1.75rem] leading-tight font-semibold tracking-[-0.015em] text-foreground">{release.title}</h1>
          <p className="mt-1 mb-6 text-control text-muted-foreground">Built in and read only: it comes with {APP_NAME} and stays out of your lists and search.</p>
          <Timeline list={list} onShow={(news) => void showMe({ name: news.lead.replace(/\.$/, ''), keys: news.keys, show: news.show }, onView)} />
          {/* The other releases, for a narrow window where the list beside is hidden. */}
          <div className="mt-8 flex flex-wrap gap-2 @[44rem]/page:hidden">
            {RELEASES.filter((one) => one.id !== open).map((one) => (
              <Button key={one.id} size="sm" variant="ghost" onClick={() => (chime('page'), setOpen(one.id))}>{dated(one.day)}: {one.title}</Button>
            ))}
          </div>
        </article>
      </div>
    </Page>
  )
}
