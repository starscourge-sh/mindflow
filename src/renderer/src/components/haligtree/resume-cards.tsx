import { useEffect, useState } from 'react'
import { ProgressBar } from './progress-bar'
import { call, useLive } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { heroOpen } from '@/lib/hero'
import { articlesOnTheGo } from '@/lib/note-place'
import { openArticle } from '@/components/pdf/pdf-reader'
import { num, plural } from '../../../../main/dates'
import { kindOf } from '@/components/capture-kinds/capture-kind-picker'
import { GrainFill, onPaper, useNoteCover } from './grain'
import { SECTIONS } from './places'
import type { Shelf } from './deck-shelf'

/** Each card's kind: its colour and icon from the app's own sets (Review's place, a note, a link). */
const REVIEW = SECTIONS.find((one) => one.id === 'review')!
const KINDS = {
  review: { tint: 'var(--tt-color-text-purple)', Icon: REVIEW.icon },
  draft: { tint: kindOf('note').tint, Icon: kindOf('note').icon },
  article: { tint: kindOf('link').tint, Icon: kindOf('link').icon }
} as const

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

/**
 * A card's cover in the book's own shape: a picture of its own when it has
 * one (an article's lead picture, the deck's cover), else Home's grain cover
 * tinted its kind's colour with its icon (or the site's icon) faint on it, as
 * Home's tiles draw a note with no picture.
 */
function Cover({ kind, seed, picture, icon }: { kind: keyof typeof KINDS; seed: string; picture?: string | null; /** A small mark of its own, drawn where the kind's icon would be: a site's icon. */ icon?: string | null }): React.JSX.Element {
  const { tint, Icon } = KINDS[kind]
  const cover = useNoteCover(seed)
  const [broken, setBroken] = useState<string[]>([])
  const shown = (src?: string | null): src is string => !!src && !broken.includes(src)
  const lose = (src: string) => () => setBroken((was) => [...was, src])
  if (shown(picture)) return <span className="continue-book-cover"><img src={picture} alt="" draggable={false} onError={lose(picture)} /></span>
  const mark = shown(icon)
    ? <img src={icon} alt="" draggable={false} onError={lose(icon)} className="relative rounded-[3px]" style={{ width: 18, height: 18, objectFit: 'contain' }} />
    : <Icon className="relative size-4 text-white/70 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]" style={cover?.paper ? onPaper(tint) : undefined} aria-hidden />
  return (
    <span className="continue-book-cover continue-book-mark relative" style={cover ? undefined : { background: `color-mix(in oklab, ${tint} 16%, transparent)`, color: tint }}>
      {cover && <GrainFill cover={cover} tint={tint} shade={cover.paper ? 'all' : 'none'} />}
      {cover || shown(icon) ? mark : <Icon className="size-4" aria-hidden />}
    </span>
  )
}

/** An article's cover: its lead picture, else its site's own icon on the grain, asked of main (web-articles.ts). */
function ArticleCover({ href, picture }: { href: string; picture?: string | null }): React.JSX.Element {
  const icon = useLive(() => (picture ? Promise.resolve(null) : call<string | null>('web:icon', href)), null as string | null, [href, picture])
  return <Cover kind="article" seed={href} picture={picture} icon={icon} />
}

function Card({ cover, title, where, onOpen, data, share, grows = true }: { cover: React.ReactNode; title: string; where: string; onOpen: () => void; data: string; /** It opens a page here, so it grows into it (lib/hero.ts); a draft opens in its own window. */ grows?: boolean; /** How far through, 0 to 1, drawn as a book's track is. */ share?: number }): React.JSX.Element {
  return (
    <button type="button" className="continue-book" data-resume={data} onClick={(event) => (chime('open'), grows ? heroOpen(event, onOpen) : onOpen())}>
      {cover}
      <span className="continue-book-words">
        <span className="continue-book-title">{title}</span>
        <span className="continue-book-where">{where}</span>
        {/* The track's room kept when there is none, so every title in the row sits on one line. */}
        <span className="continue-book-track" style={share === undefined ? { visibility: 'hidden' } : undefined}>
          <ProgressBar edge value={share ?? 0} label={`${Math.round((share ?? 0) * 100)}% read`} thick={3} silent fill="var(--tt-brand-color-500)" className="w-full" />
        </span>
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
  // The Review card wears a deck's own cover when a deck has cards waiting.
  const shelves = useLive(() => call<Shelf[]>('decks:list'), [] as Shelf[], [], ['item'])
  const deckCover = shelves.find((one) => one.cover && (one.due > 0 || one.fresh > 0))?.cover ?? null
  return [
    sitting.done > 0 && sitting.left > 0 && (
      <Card key="review" data="review" cover={<Cover kind="review" seed="review" picture={deckCover} />} title={`${plural(sitting.left, 'card')} left in Review`}
        where={`${num(sitting.done)} done ${partOfDay(sitting.last)}`} share={sitting.done / (sitting.done + sitting.left)} onOpen={() => onView('review')} />
    ),
    draft && (
      <Card key="draft" data="draft" cover={<Cover kind="draft" seed={`draft-${draft.slice(0, 20)}`} />} title={draft.length > 60 ? `${draft.slice(0, 60).trim()}…` : draft}
        where="A draft in quick capture" grows={false} onOpen={() => window.api.showPrompt()} />
    ),
    ...articles.map((one) => (
      <Card key={one.href} data="article" cover={<ArticleCover href={one.href} picture={one.picture} />} title={one.title}
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
    // The ribbon's page when one is laid (the book opens there), else the page kept as you read.
    const src = last?.view.id === 'pdf' ? last.view.focus : null
    if (src) void Promise.all([call<{ page: number } | null>('ribbon:get', src), call<{ page: number } | null>('pdf:place', src)]).then(([laid, one]) => setPage(laid?.page || one?.page || null))
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
