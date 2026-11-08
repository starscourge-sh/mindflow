import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './files.css'
import { smallPicture } from '@/lib/notes'
import { usePdfCover } from '@/components/pdf/pdf-cover'
import { chime } from '@/lib/sound'
import { realMove } from '@/lib/real-move'
import { VirtualList } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { SoundPlayer, soundTitle } from './sound-player'
import { num, plural } from '../../../../main/dates'
import type { Media, MediaUse } from '../../../../main/media'

/** The three shelves Files sorts everything onto: a GIF is a picture that moves. */
export type Shelf = 'pdf' | 'picture' | 'audio'
export const shelfOf = (one: Media): Shelf => (one.kind === 'gif' ? 'picture' : one.kind)
export const SHELVES: { id: Shelf; label: string; one: string; many: string }[] = [
  { id: 'pdf', label: 'Books', one: 'book', many: 'books' },
  { id: 'picture', label: 'Pictures', one: 'picture', many: 'pictures' },
  { id: 'audio', label: 'Audio', one: 'recording', many: 'recordings' }
]

/** A file's name without its ending, as a person says it. */
const bare = (name: string): string => name.replace(/\.[^.]+$/, '') || name
/** What a file is called on its face: a recording by its own name, a picture by its name or else its note's. */
export const nameOf = (one: Media): string => (one.kind === 'audio' && one.name ? soundTitle(one.name, null) : one.name ? bare(one.name) : one.title) || (one.kind === 'audio' ? 'Voice note' : one.kind === 'pdf' ? 'Book' : 'Picture')

/** A recording drawn as its own little waveform, the same bars for the same file every time. */
function Bars({ seed }: { seed: string }): React.JSX.Element {
  const heights = useMemo(() => {
    let h = 7
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return Array.from({ length: 14 }, () => ((h = (h * 1103515245 + 12345) >>> 0), 22 + (h % 70)))
  }, [seed])
  return (
    <span className="flex size-full items-center justify-center gap-[3px] bg-[color-mix(in_oklab,var(--foreground)_80%,var(--card))] px-3">
      {heights.map((height, at) => <span key={at} className="w-[3px] rounded-full bg-[color-mix(in_oklab,var(--card)_75%,transparent)]" style={{ height: `${height}%` }} />)}
    </span>
  )
}

/** A file's face, as small as it is drawn: a picture's cached small copy, a book's first page, a recording's bars. */
export function Cover({ one, className = '' }: { one: Media; className?: string }): React.JSX.Element {
  const book = usePdfCover(one.kind === 'pdf' && !one.gone ? one.src : null, one.name)
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => {
    if (one.kind === 'audio' || one.kind === 'pdf' || one.gone) return
    let live = true
    void smallPicture(one.src, true).then((made) => live && setThumb(made || ''))
    return () => void (live = false)
  }, [one.src, one.kind, one.gone])
  const image = one.kind === 'pdf' ? book?.image : thumb
  return (
    <span data-cover={one.kind} className={`block overflow-hidden bg-accent ${one.private ? 'private-text' : ''} ${className}`}>
      {one.kind === 'audio' ? <Bars seed={one.src} /> : image ? <img src={image} alt="" draggable={false} decoding="async" className={`size-full ${one.kind === 'pdf' ? 'bg-[var(--pdf-paper,#fff)] object-contain' : 'object-cover'}`} /> : null}
    </span>
  )
}

/** Where the fanned covers sit, back to front, and how far they lean, by how many there are: one stands in the middle. */
const FANS: { x: number; r: number; y: number }[][] = [
  [],
  [{ x: 0, r: -2, y: 0 }],
  [{ x: -11, r: -5, y: 4 }, { x: 11, r: 4, y: 0 }],
  [{ x: -20, r: -8, y: 8 }, { x: 0, r: -1, y: 0 }, { x: 20, r: 7, y: 6 }],
  [{ x: -24, r: -8, y: 10 }, { x: -8, r: -3, y: 2 }, { x: 8, r: 3, y: 4 }, { x: 24, r: 8, y: 11 }]
]

/**
 * One kind as a pile, as a bookshop's "My books" shelf shows a genre: its
 * newest few covers fanned out of a frosted pocket with a screw at each
 * corner, the kind and its count under it. The frost is painted, opaque: the
 * pocket's own colour over the covers' colours blurred, never a see-through
 * glass that lets what is behind read through.
 */
export function Pile({ shelf, files, onOpen }: { shelf: (typeof SHELVES)[number]; files: Media[]; onOpen: () => void }): React.JSX.Element {
  const top = files.slice(0, 4).reverse()
  const heard = useRef(false)
  const book = shelf.id === 'pdf'
  return (
    <button type="button" data-pile={shelf.id} data-count={files.length} onClick={() => (chime('open'), onOpen())}
      onPointerMove={(event) => { if (!heard.current && realMove(event)) (heard.current = true), chime('fan') }}
      onPointerLeave={() => (heard.current = false)}
      className="files-pile group/pile flex w-[82%] max-w-[280px] min-w-0 cursor-pointer flex-col gap-2.5 text-left outline-none">
      {/* 82% of its column's width but as tall as a 5:4 shelf the column's full width: narrower, never shorter. */}
      <span className="files-pile-box relative block aspect-[41/40] w-full">
        {top.map((one, at) => {
          const fan = FANS[top.length][at]
          return (
            <span key={one.src} className="files-pile-cover absolute bottom-[24%] left-1/2 block w-[38%] overflow-hidden rounded-[4px] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.25)] ring-1 ring-foreground/10"
              style={{ '--x': `${fan.x}%`, '--r': `${fan.r}deg`, '--y': `${fan.y}%` } as React.CSSProperties}>
              <Cover one={one} className={book ? 'aspect-[3/4]' : 'aspect-square'} />
            </span>
          )
        })}
        <span className="files-pile-front absolute inset-x-0 bottom-0 block h-[40%] overflow-hidden rounded-[8px]">
          {/* The frost: the covers' own colours, blurred and washed out under the pocket's paint. */}
          <span aria-hidden className="files-pile-frost absolute inset-0 flex items-start justify-center gap-1">
            {top.map((one) => <Cover key={one.src} one={one} className="h-full w-[30%]" />)}
          </span>
          {['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((at) => <span key={at} aria-hidden className={`files-pile-screw absolute ${at}`} />)}
        </span>
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5 px-0.5 text-body">
        <span className="font-medium text-foreground">{shelf.label}</span>{' '}
        <span className="text-muted-foreground tabular-nums" aria-label={plural(files.length, shelf.one, shelf.many)}>· {num(files.length)}</span>
      </span>
    </button>
  )
}

/** The last few added or opened, any kind, in one row: small faces with their names under. */
export function RecentRow({ files, onOpen, menuFor }: { files: Media[]; onOpen: (one: Media) => void; menuFor: (one: Media) => RowItem[] }): React.JSX.Element {
  return (
    <section data-files-recent className="flex flex-col gap-2">
      <h3 className="text-body font-medium text-foreground">Recent</h3>
      <div className="files-recent-row flex gap-3 overflow-x-auto pb-1">
        {files.map((one) => (
          <RowMenu key={one.src} items={menuFor(one)}>
            <button type="button" data-recent-file={one.kind} data-src={one.src} onClick={() => onOpen(one)} className="files-press flex w-[96px] shrink-0 cursor-pointer flex-col gap-1.5 text-left">
              <Cover one={one} className={`size-[96px] rounded-[4px] ring-1 ring-foreground/10 ${one.kind === 'pdf' ? 'files-recent-book' : ''}`} />
              <span dir="auto" className={`truncate text-xs text-muted-foreground ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
            </button>
          </RowMenu>
        ))}
      </div>
    </section>
  )
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const monthOf = (iso: string): string => (iso ? MONTH.format(new Date(iso)) : 'Undated')
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dayOf = (iso: string): string => {
  if (!iso) return 'Undated'
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000)
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : DAY.format(date)
}
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

type Line = { key: string; head: string; count: number } | { key: string; files: Media[]; from: number }

/** Files cut into groups by a heading (a month, a day), each group then into lines `across` wide. */
function grouped(files: Media[], headOf: (iso: string) => string, across: number): Line[] {
  const out: Line[] = []
  let at = 0
  while (at < files.length) {
    const head = headOf(files[at].at)
    let end = at
    while (end < files.length && headOf(files[end].at) === head) end++
    out.push({ key: `h:${head}:${at}`, head, count: end - at })
    for (let from = at; from < end; from += across) out.push({ key: files[from].src, files: files.slice(from, Math.min(from + across, end)), from })
    at = end
  }
  return out
}

/** A heading over a group: its name, and how many under it. */
const Head = ({ line, held = false }: { line: { head: string; count: number }; /** The copy held at the top. */ held?: boolean }): React.JSX.Element => (
  <h3 data-files-group={held ? undefined : ''} data-files-held={held ? '' : undefined} aria-hidden={held || undefined} className="flex items-baseline gap-1.5 pt-5 pb-2 text-body">
    <span className="font-medium text-foreground">{line.head}</span>{' '}
    <span className="text-muted-foreground tabular-nums">· {num(line.count)}</span>
  </h3>
)

/** Where each line of Pictures' grid starts and ends among the files, month by month: a month's last line is often short. */
export const pictureSpans = (files: Media[], across: number): [number, number][] =>
  grouped(files, monthOf, across).flatMap((line) => ('files' in line ? [[line.from, line.from + line.files.length] as [number, number]] : []))

/**
 * Up or down in a grid cut into months: to the line above or under, in the same column, over a month's heading as
 * Photos goes; onto a shorter line, its last picture. At the first or the last line it stays.
 */
export function stepLine(spans: [number, number][], at: number, by: 1 | -1): number {
  const line = spans.findIndex(([from, end]) => at >= from && at < end)
  const to = spans[line + by]
  if (line < 0 || !to) return at
  return Math.min(to[0] + (at - spans[line][0]), to[1] - 1)
}

/** A heading's height in the list, as `sizeOf` has it. */
const HEAD = 52

/**
 * The heading of the group at the top of the list, held there while its group scrolls under it, as Photos holds the
 * month: drawn over the list (no room of its own), opaque, and pushed up by the next heading as it arrives. Read from
 * the rows drawn, so it costs nothing however long the list is.
 */
function StuckHead({ lines }: { lines: Line[] }): React.JSX.Element {
  const at = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<{ head: string; count: number; push: number } | null>(null)
  useLayoutEffect(() => {
    const mark = at.current
    let scroller = mark?.parentElement ?? null
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const list = mark?.nextElementSibling
    if (!mark || !scroller || !list) return
    const read = (): void => {
      const top = mark.getBoundingClientRect().top
      const rows = [...list.querySelectorAll<HTMLElement>(':scope > div > [data-index]')]
      const first = rows.find((row) => row.getBoundingClientRect().bottom > top + 0.5)
      if (!first) return setHeld(null)
      let index = Number(first.dataset.index)
      while (index > 0 && !('head' in lines[index])) index--
      const line = lines[index]
      const own = rows.find((row) => Number(row.dataset.index) === index)
      // Its own heading still in sight at the top: that one is the heading, nothing is held over it.
      if (!line || !('head' in line) || (own && own.getBoundingClientRect().top >= top - 0.5)) return setHeld(null)
      const next = rows.find((row) => Number(row.dataset.index) > index && 'head' in lines[Number(row.dataset.index)])
      const tall = (mark.firstElementChild as HTMLElement | null)?.offsetHeight || HEAD
      const push = next ? Math.min(0, Math.round(next.getBoundingClientRect().top - top - tall)) : 0
      setHeld((was) => (was && was.head === line.head && was.count === line.count && was.push === push ? was : { head: line.head, count: line.count, push }))
    }
    read()
    scroller.addEventListener('scroll', read, { passive: true })
    const sized = new ResizeObserver(read)
    sized.observe(list)
    return () => (scroller.removeEventListener('scroll', read), sized.disconnect())
  }, [lines])
  return (
    <div ref={at} data-files-stuck className="pointer-events-none sticky top-0 z-10 h-0">
      {held && <div className="bg-background" style={{ transform: held.push ? `translateY(${held.push}px)` : undefined }}><Head line={held} held /></div>}
    </div>
  )
}

/** Its note, said in a word: where a file is, or that it is in none. */
export const whereOf = (one: Media): string => (one.gone ? 'File gone from the book' : one.uses.length ? `In ${one.uses[0].title || 'Untitled'}${one.uses.length > 1 ? ` and ${num(one.uses.length - 1)} more` : ''}` : 'In no note')

export const PICTURE = 148
export const PICTURE_GAP = 10

/**
 * Pictures as Photos keeps them: by month, newest first, a heading and its
 * count over each, then a grid of squares with small gaps and no words under them.
 * Pointed at, a picture's name and note rise out of a soft shade at its foot. Only the
 * rows in sight are drawn, so five thousand scroll as five do.
 */
export function PictureMonths({ files, across, cursor, chosen, keyOf, menuFor, onClick }: {
  files: Media[]; across: number; cursor: number; chosen: string[]; keyOf: (one: Media) => string
  menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void
}): React.JSX.Element {
  const lines = useMemo(() => grouped(files, monthOf, across), [files, across])
  const cursorKey = files[cursor] ? keyOf(files[cursor]) : null
  return (
    <>
    <StuckHead lines={lines} />
    <VirtualList items={lines} keyOf={(line) => line.key} rowClass="" estimate={PICTURE + PICTURE_GAP}
      sizeOf={(line) => ('head' in line ? HEAD : PICTURE + PICTURE_GAP)}
      holds={(line, key) => 'files' in line && line.files.some((one) => keyOf(one) === key)}
      cursor={cursorKey ? lines.findIndex((line) => 'files' in line && line.files.some((one) => keyOf(one) === cursorKey)) : undefined}>
      {(line) => 'head' in line ? <Head line={line} /> : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap: PICTURE_GAP, paddingBottom: PICTURE_GAP }}>
          {line.files.map((one, at) => {
            const key = keyOf(one)
            const here = line.from + at === cursor
            const picked = chosen.includes(key)
            return (
              <RowMenu key={key} items={menuFor(one)}>
                <button type="button" data-media={one.kind} data-src={one.src} data-id={one.src} data-cursor={here || undefined} data-picked={picked || undefined}
                  onClick={(event) => onClick(one, event)}
                  className={`files-square group/sq relative block aspect-square w-full cursor-pointer overflow-hidden rounded-[6px] bg-accent text-left outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[6px] after:ring-inset ${picked ? 'after:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] after:ring-2 after:ring-[var(--tt-brand-color-400)]' : here ? 'after:ring-2 after:ring-ring' : 'after:ring-1 after:ring-foreground/10'}`}>
                  <Cover one={one} className="size-full" />
                  {one.kind === 'gif' && <span className="absolute top-1.5 left-1.5 rounded-[3px] bg-background px-1 text-[11px] font-medium">GIF</span>}
                  {/* Pointed at, its name rises out of a soft shade at its foot: no band, nothing on it until then. */}
                  <span data-square-foot className="files-square-foot pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end px-2 pt-6 pb-1.5 text-white">
                    {/* A picture with no name of its own is called after its note: then the note is said once. */}
                    {nameOf(one) !== one.uses[0]?.title && <span dir="auto" className={`truncate text-xs font-medium ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>}
                    <span className={`truncate ${nameOf(one) !== one.uses[0]?.title ? 'text-[11px] text-white/75' : 'text-xs font-medium'}`}>{whereOf(one)}</span>
                  </span>
                </button>
              </RowMenu>
            )
          })}
        </div>
      )}
    </VirtualList>
    </>
  )
}

/**
 * Recordings as Voice Memos lists them: by day, newest first, one line each
 * with its player (play, its waveform and its length), its name, the note it
 * is in and the time it was made.
 */
export function AudioDays({ files, cursor, chosen, keyOf, menuFor, onClick, onUse }: {
  files: Media[]; cursor: number; chosen: string[]; keyOf: (one: Media) => string
  menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void
}): React.JSX.Element {
  const lines = useMemo(() => grouped(files, dayOf, 1), [files])
  const cursorKey = files[cursor] ? keyOf(files[cursor]) : null
  return (
    <>
    <StuckHead lines={lines} />
    <VirtualList items={lines} keyOf={(line) => line.key} rowClass="" estimate={64}
      sizeOf={(line) => ('head' in line ? HEAD : 64)}
      holds={(line, key) => 'files' in line && keyOf(line.files[0]) === key}
      cursor={cursorKey ? lines.findIndex((line) => 'files' in line && keyOf(line.files[0]) === cursorKey) : undefined}>
      {(line) => {
        if ('head' in line) return <Head line={line} />
        const one = line.files[0]
        const key = keyOf(one)
        const here = line.from === cursor
        const picked = chosen.includes(key)
        return (
          <RowMenu items={menuFor(one)}>
            <div data-media="audio" data-src={one.src} data-id={one.src} data-cursor={here || undefined} data-picked={picked || undefined} role="button" tabIndex={-1}
              onClick={(event) => onClick(one, event)}
              className={`files-audio-row grid min-h-[60px] cursor-pointer items-center gap-x-4 rounded-[6px] px-2 py-2 ${picked ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : here ? 'bg-accent' : 'hover:bg-accent/60'}`}>
              <span className="flex min-w-0 flex-col">
                <span dir="auto" className={`truncate text-body font-medium text-foreground ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
                {one.uses.length ? (
                  <button type="button" data-media-use className="w-fit max-w-full cursor-pointer truncate text-left text-xs text-muted-foreground underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground" onClick={(event) => (event.stopPropagation(), onUse(one.uses[0], one.src))}>{whereOf(one)}</button>
                ) : <span className="text-xs text-muted-foreground">{whereOf(one)}</span>}
              </span>
              {/* Played where it sits: a press on the player is the player's, never the row's (which opens the note). */}
              <span className="files-audio-player min-w-0" onClick={(event) => event.stopPropagation()}><SoundPlayer src={one.src} className="w-full" /></span>
              <span className="files-audio-time text-right text-xs text-muted-foreground tabular-nums">{one.at ? TIME.format(new Date(one.at)) : ''}</span>
            </div>
          </RowMenu>
        )
      }}
    </VirtualList>
    </>
  )
}
