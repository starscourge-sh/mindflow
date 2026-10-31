import { useEffect, useState } from 'react'
import { Globe, Layers, PenLine } from 'lucide-react'
import { call, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { articlesOnTheGo } from '@/lib/note-place'
import { openArticle } from '@/components/pdf/pdf-reader'
import { num } from '../../../../main/dates'

type Sitting = { done: number; left: number; last: string | null }

/** "this morning", "this afternoon", "this evening": when a sitting was put down today. */
const partOfDay = (at: string | null): string => {
  const hour = at ? new Date(at).getHours() : 12
  return hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : 'this evening'
}

/** A draft's first words, from quick capture's kept document. */
function draftWords(): string {
  try {
    const doc = JSON.parse(localStorage.getItem('capture-draft') ?? 'null') as unknown
    const words: string[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const one = node as { text?: string; content?: unknown[] }
      if (typeof one.text === 'string') words.push(one.text)
      one.content?.forEach(walk)
      if (one.content) words.push(' ')
    }
    walk(doc)
    return words.join('').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

function Card({ icon, title, where, onOpen, data, share }: { icon: React.ReactNode; title: string; where: string; onOpen: () => void; data: string; /** How far through, 0 to 1, drawn as a book's track is. */ share?: number }): React.JSX.Element {
  return (
    <button type="button" className="continue-book" data-resume={data} onClick={() => (chime('open'), onOpen())}>
      <span className="continue-book-cover continue-book-mark">{icon}</span>
      <span className="continue-book-words">
        <span className="continue-book-title">{title}</span>
        <span className="continue-book-where">{where}</span>
        {share !== undefined && (
          <span className="continue-book-track">
            <span style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * Everything else left part way, for Home's "Continue reading" beside the
 * books: a Review sitting put down today ("12 cards left from this morning"),
 * a draft waiting in quick capture, and web articles read part way, each one
 * click back to where you were.
 */
export function useResumeCards(onView: (id: string) => void): React.ReactNode[] {
  const sitting = useLive(() => call<Sitting>('review:sitting'), { done: 0, left: 0, last: null } as Sitting, [], ['item'])
  const [draft, setDraft] = useState(draftWords)
  // Quick capture writes its draft in its own window: read again as it changes there.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => void (event.key === 'capture-draft' && setDraft(draftWords()))
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const articles = articlesOnTheGo().slice(0, 3)
  return [
    sitting.done > 0 && sitting.left > 0 && (
      <Card key="review" data="review" icon={<Layers className="size-5" />} title={`${num(sitting.left)} ${sitting.left === 1 ? 'card' : 'cards'} left in Review`}
        where={`${num(sitting.done)} done ${partOfDay(sitting.last)}`} share={sitting.done / (sitting.done + sitting.left)} onOpen={() => onView('review')} />
    ),
    draft && (
      <Card key="draft" data="draft" icon={<PenLine className="size-5" />} title={draft.length > 60 ? `${draft.slice(0, 60).trim()}…` : draft}
        where="A draft in quick capture" onOpen={() => window.api.showPrompt()} />
    ),
    ...articles.map((one) => (
      <Card key={one.href} data="article" icon={<Globe className="size-5" />} title={one.title}
        where={`${Math.round(one.share * 100)}% read · ${URL.parse(one.href)?.hostname.replace(/^www\./, '') ?? 'Article'}`} share={one.share} onOpen={() => openArticle(one.href)} />
    ))
  ].filter(Boolean) as React.ReactNode[]
}

/** The one thing you were last in (a note, a book, an article), kept as you move (home.tsx). */
export type LastPlace = { view: { id: string; focus?: string; tab?: string; folder?: string }; title: string; at: number }
export const LAST_PLACE = 'last-place'
const SEEN = 'last-seen'
/** How long the app was away, read once as it starts, before this run marks itself seen. */
const away = Date.now() - (Number(localStorage.getItem(SEEN)) || Date.now())
const seen = (): void => {
  try {
    localStorage.setItem(SEEN, String(Date.now()))
  } catch {
    // Kept for this run only.
  }
}
window.addEventListener('pagehide', seen)
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && seen())
/** Away this long counts as a long absence: back the next morning, or after a weekend. */
const LONG = 6 * 60 * 60 * 1000

/**
 * Home's top line after a long absence: the one thing you were last in, said
 * plainly ("You were reading The Law Book, p. 12"), one click back there.
 */
export function WelcomeBack({ onOpen, onView }: { onOpen: (type: string, id: string) => void; onView: (id: string, focus?: string) => void }): React.JSX.Element | null {
  const [last] = useState<LastPlace | null>(() => {
    try {
      return away >= LONG ? (JSON.parse(localStorage.getItem(LAST_PLACE) ?? 'null') as LastPlace | null) : null
    } catch {
      return null
    }
  })
  const [page, setPage] = useState<number | null>(null)
  useEffect(() => {
    if (last?.view.id === 'pdf' && last.view.focus) void call<{ page: number } | null>('pdf:place', last.view.focus).then((one) => setPage(one?.page ?? null))
  }, [last])
  if (!last?.view.focus) return null
  const reading = last.view.id === 'pdf' || last.view.id === 'web'
  const go = (): void => {
    chime('open')
    if (reading) onOpen(last.view.id, last.view.focus!)
    else onView(last.view.id, last.view.focus)
  }
  return (
    <div data-welcome-back className="page-column relative w-full px-5 pt-4 @[44rem]/page:px-8">
      <button type="button" onClick={go} className="group w-full cursor-pointer rounded-lg px-2 py-2 text-left hover:bg-foreground/[0.045]">
        <span className="font-heading text-[1.25rem] leading-snug text-foreground">
          You were {reading ? 'reading' : 'in'} <span className="font-semibold">{last.title}</span>{page ? `, p. ${num(page)}` : ''}.
        </span>
        <span className="ml-2 text-control text-muted-foreground group-hover:text-foreground">Pick up where you left off →</span>
      </button>
    </div>
  )
}
