import { useMemo } from 'react'
import { BookOpen, GraduationCap } from 'lucide-react'
import { chime } from '@/lib/sound'
import { call, useLive } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { readLibrary, type Book } from '@/components/pdf/book-head'
import { openPdf } from '@/components/pdf/pdf-reader'
import { num, plural } from '../../../../main/dates'
import { STUDY_INK } from './calendar-events'

/**
 * The study plan on the Calendar, from what is already kept and nothing
 * made up: on each day the cards that fall due (today takes in every one
 * already due), and a book on the day your pace says you finish it ("Done
 * by", main/pace.ts). Shown or hidden with "Study" in My calendars.
 */
export type StudyDay = { reviews: number; books: Book[] }

/** Each day from `from` to `to` ("YYYY-MM-DD", both kept) that holds something to study. */
export function useStudy(from: string, to: string, on: boolean): Map<string, StudyDay> {
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  const dueRead = useLive(() => (on ? call<Record<string, number>>('study:days', new Date(`${from}T00:00:00`).toISOString(), end.toISOString()) : Promise.resolve({})), null as Record<string, number> | null, [from, to, on])
  const booksRead = useLive(() => (on ? readLibrary() : Promise.resolve([] as Book[])), null as Book[] | null, [on])
  // The Calendar waits for them: a day's "Review · 16 cards" came in over the hours a beat late and pushed them down.
  useReading(dueRead === null || booksRead === null)
  const due = dueRead ?? {}
  const books = booksRead ?? []
  return useMemo(() => {
    const days = new Map<string, StudyDay>()
    const at = (key: string): StudyDay => days.get(key) ?? (days.set(key, { reviews: 0, books: [] }), days.get(key)!)
    for (const [key, n] of Object.entries(due) as [string, number][]) if (key >= from && key <= to && n > 0) at(key).reviews = n
    for (const book of books) if (book.finishBy && book.finishBy >= from && book.finishBy <= to) at(book.finishBy).books.push(book)
    return days
  }, [due, books, from, to])
}

const CHIP = 'pointer-events-auto flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 text-left text-control leading-6 whitespace-nowrap text-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
const TINT = { background: `color-mix(in oklab, ${STUDY_INK} 13%, var(--background))` }

/** "Review · 24 cards": opens Review. */
export function ReviewChip({ n, style }: { n: number; style?: React.CSSProperties }): React.JSX.Element {
  return (
    <button type="button" data-study-review aria-label={`Review ${plural(n, 'card')}`} onClick={(event) => (event.stopPropagation(), chime('open'), window.api.openInHome('view', 'review', ':today'))}
      className={`${CHIP} @container hover:brightness-95 dark:hover:brightness-125`} style={{ ...TINT, ...style }}>
      <GraduationCap aria-hidden className="size-3.5 shrink-0" style={{ color: STUDY_INK }} />
      {/* Narrow, the count alone beside the cap: "Review · 24 cards" never cut to "Review · 2…", nor "12,345 cards" to
          "12,345 ca…". The count never shrinks; the word wraps onto a hidden second line when it does not fit whole. */}
      <span className="flex h-[1lh] min-w-0 flex-wrap overflow-hidden tabular-nums"><span className={n >= 1000 ? 'hidden @[11rem]:inline' : 'hidden @[8.5rem]:inline'}>Review ·&nbsp;</span><span className="shrink-0">{num(n)}</span><span className="whitespace-pre"> {n === 1 ? 'card' : 'cards'}</span></span>
    </button>
  )
}

/** A book on the day you finish it at your pace: its name and the page you are on, opening it there. */
export function BookChip({ book, style }: { book: Book; style?: React.CSSProperties }): React.JSX.Element {
  const name = book.title || book.name.replace(/\.pdf$/i, '')
  return (
    <button type="button" data-study-book={book.src} aria-label={`${name}, page ${num(book.page ?? 1)}${book.pages ? ` of ${num(book.pages)}` : ''}: done by this day at your pace`}
      onClick={(event) => (event.stopPropagation(), chime('page'), openPdf(book.src, book.name))}
      className={`${CHIP} hover:brightness-95 dark:hover:brightness-125`} style={{ ...TINT, ...style }}>
      <BookOpen aria-hidden className="size-3.5 shrink-0" style={{ color: STUDY_INK }} />
      <span className="min-w-0 truncate">{name}</span>
      {book.page && <span className="shrink-0 text-muted-foreground tabular-nums">p. {num(book.page)}</span>}
    </button>
  )
}

/** A day's study chips, reviews first. `on` (the day's key) keeps their keys apart when several days share one list. */
export const studyChips = (day: StudyDay | undefined, style?: React.CSSProperties, on = ''): React.JSX.Element[] => !day ? [] : [
  ...(day.reviews ? [<ReviewChip key={`review:${on}`} n={day.reviews} style={style} />] : []),
  ...day.books.map((book) => <BookChip key={`${on}:${book.src}`} book={book} style={style} />)
]
