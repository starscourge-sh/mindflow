import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './files.css'
import { smallPicture, useSmallPicture } from '@/lib/notes'
import { useMade } from '@/lib/decoded'
import { usePdfCover } from '@/components/pdf/pdf-cover'
import { chime } from '@/lib/sound'
import { heroOpen } from '@/lib/hero'
import { realMove } from '@/lib/real-move'
import { scrollerOf } from '@/lib/note-place'
import { VirtualList } from './ui'
import { RowMenu, type RowItem } from './row-menu'
import { SoundPlayer, clock, soundTitle } from './sound-player'
import { keepLength, placeOf, type Place } from '@/lib/media-opened'
import { BookOpen, Play } from 'lucide-react'
import { call } from '@/lib/haligtree'
import { dayMonth, daysFromToday, num, plural } from '../../../../main/dates'
import type { Media, MediaUse } from '../../../../main/media'

/**
 * The shelves Files sorts everything onto: a GIF is a picture that moves, and Documents holds every file that is not a
 * book, a picture, a recording or a video (Word, Pages, a spreadsheet, a slideshow, a ZIP, anything), as Finder's
 * Documents folder would.
 */
export type Shelf = 'pdf' | 'picture' | 'audio' | 'video' | 'document'
export const shelfOf = (one: Media): Shelf => (one.kind === 'gif' ? 'picture' : one.kind)
export const SHELVES: { id: Shelf; label: string; one: string; many: string }[] = [
  { id: 'pdf', label: 'Books', one: 'book', many: 'books' },
  { id: 'picture', label: 'Images', one: 'image', many: 'images' },
  { id: 'audio', label: 'Audio', one: 'recording', many: 'recordings' },
  { id: 'video', label: 'Videos', one: 'video', many: 'videos' },
  { id: 'document', label: 'Documents', one: 'document', many: 'documents' }
]

/** What a file is, in a word: a document by its own ending ("DOCX", "ZIP"), as Finder's Kind column starts; a picture is an
 * "Image", as Files' own tab and filter call them. */
export const kindWord = (one: Pick<Media, 'kind' | 'name' | 'src'>): string => {
  if (one.kind !== 'document') return ({ picture: 'Image', gif: 'GIF', pdf: 'PDF', audio: 'Recording', video: 'Video' } as const)[one.kind]
  const end = /\.([a-z0-9]{1,8})$/i.exec(one.name)?.[1] ?? /\.([a-z0-9]+)$/.exec(one.src)?.[1]
  return end && end !== 'bin' ? end.toUpperCase() : 'File'
}

const WEBM = /\.webm$/
/** Faces found so far, by file and size: a tile scrolled away and back shows its face at once. */
const faces = new Map<string, { image: string; icon: boolean }>()
/** A file's face already drawn on a tile, the larger first, for a preview to open with at once. */
export const faceOf = (src: string): { image: string; icon: boolean } | undefined => faces.get(`true:${src}`) ?? faces.get(`false:${src}`)
/**
 * A video's or a document's face, made in the main process (notes.ts, quickLook): a frame of the video, a document's
 * first page as Quick Look draws it, or for a file Quick Look cannot draw, the Mac's own icon for its kind (`icon`).
 * Null while it is asked for; asked only once its tile is drawn.
 */
export function useFileFace(one: Media | null, large: boolean): { image: string; icon: boolean } | null {
  // A WebM is a film the Mac's Quick Look cannot open (it draws a QuickTime icon): its first frame comes from the window's own player instead (FileFace).
  const key = one && !one.gone && (one.kind === 'document' || (one.kind === 'video' && !WEBM.test(one.src))) ? `${large}:${one.src}` : null
  // Made and decoded before its tile is first drawn (its page waits, 150 ms at most), so it is whole in that frame.
  const made = useMade(key && `face:${key}`, () =>
    smallPicture(one!.src, large)
      .then(async (image) => (image ? { image, icon: false } : { image: await call<string>('media:icon', one!.src).catch(() => ''), icon: true }))
      .then((face) => (faces.set(key!, face), face.image)))
  return key && typeof made === 'string' ? faces.get(key) ?? null : null
}

/** A face as a video's or a document's is drawn: the frame or page whole on its card, or the Mac's icon with its kind under it. */
export function FileFace({ one, face, tiny = false }: { one: Media; face: { image: string; icon: boolean } | null; tiny?: boolean }): React.JSX.Element | null {
  if (one.kind === 'video' && WEBM.test(one.src) && !one.gone) {
    return (
      <span data-file-face="video" className="relative block size-full bg-black">
        {/* Its first frame, as the player draws it: loads only what that frame needs, and never plays. */}
        <video src={`${one.src}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} className="pointer-events-none size-full object-cover" />
        {!tiny && <span aria-hidden className="absolute inset-0 m-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-black/55 text-white"><Play className="size-4 translate-x-px fill-current" /></span>}
      </span>
    )
  }
  if (!face) return null
  if (face.icon || !face.image) {
    return (
      <span data-file-face="icon" className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
        {face.image && <img src={face.image} alt="" draggable={false} className={tiny ? 'size-full object-contain p-0.5' : 'size-12 object-contain'} />}
        {!tiny && <span className="text-xs font-medium tracking-wide">{kindWord(one)}</span>}
      </span>
    )
  }
  return (
    <span data-file-face={one.kind} className="relative block size-full">
      {/* A document's page on paper, as a book's cover is (pdf.css): the whole face one sheet, never a page between two
          bars. A page (taller than wide) shows its top across the face, where its title is, large enough to read; a
          square face (the icon Quick Look draws for a ZIP) shows whole. */}
      <img src={face.image} alt="" draggable={false} decoding="async"
        onLoad={(event) => { const img = event.currentTarget; if (one.kind === 'document' && img.naturalHeight > img.naturalWidth * 1.15) img.dataset.page = ''; if (one.kind === 'video' && img.naturalHeight > img.naturalWidth) img.dataset.upright = '' }}
        className={`size-full ${one.kind === 'video' ? 'object-cover' : 'bg-[var(--pdf-paper,#fff)] object-contain data-[page]:object-cover data-[page]:object-top'}`} />
      {one.kind === 'video' && !tiny && (
        <span aria-hidden className="absolute inset-0 m-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-black/55 text-white"><Play className="size-4 translate-x-px fill-current" /></span>
      )}
    </span>
  )
}

/** A file's name without its ending, as a person says it. */
const bare = (name: string): string => name.replace(/\.[^.]+$/, '') || name
/** What a file is called on its face: a recording by its own name, a picture by its name or else its note's. */
export const nameOf = (one: Media): string => (one.kind === 'audio' && one.name ? soundTitle(one.name, null) : one.name ? bare(one.name) : one.title) || (one.kind === 'audio' ? 'Voice note' : one.kind === 'pdf' ? 'Book' : one.kind === 'video' ? 'Video' : one.kind === 'document' ? 'Document' : 'Picture')

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
export function Cover({ one, className = '', tiny = false }: { one: Media; className?: string; /** Drawn a few dozen pixels across (a table's face): the 96px copy, not the 320px one. */ tiny?: boolean }): React.JSX.Element {
  const book = usePdfCover(one.kind === 'pdf' && !one.gone ? one.src : null, one.name)
  const file = one.kind === 'video' || one.kind === 'document'
  const face = useFileFace(file ? one : null, !tiny)
  // Made small and decoded before its tile is first drawn (its page waits, 150 ms at most), so it is whole in that frame.
  const made = useSmallPicture(one.kind === 'audio' || one.kind === 'pdf' || file || one.gone ? null : one.src, !tiny)
  // No small copy could be made (a format the cache cannot shrink): the picture itself, never an empty square.
  const thumb = made === '' ? one.src : made
  const image = one.kind === 'pdf' ? book?.image : thumb
  return (
    <span data-cover={one.kind} className={`block overflow-hidden bg-accent ${one.private ? 'private-text' : ''} ${className}`}>
      {one.kind === 'audio' ? <Bars seed={one.src} /> : file ? <FileFace one={one} face={face} tiny={tiny} /> : image ? <img src={image} alt="" draggable={false} decoding="async" className={`size-full ${one.kind === 'pdf' ? 'bg-[var(--pdf-paper,#fff)] object-contain' : 'object-cover'}`} /> : null}
    </span>
  )
}

/** Where the fanned covers sit, back to front, and how far they lean, by how many there are: one stands in the middle. */
const FANS: { x: number; r: number; y: number }[][] = [
  [],
  [{ x: 0, r: -2, y: 0 }],
  [{ x: -11, r: -5, y: 4 }, { x: 11, r: 4, y: 0 }],
  [{ x: -20, r: -8, y: 8 }, { x: 0, r: -1, y: 0 }, { x: 20, r: 7, y: 6 }],
  [{ x: -20, r: -8, y: 10 }, { x: -7, r: -3, y: 2 }, { x: 7, r: 3, y: 4 }, { x: 20, r: 8, y: 11 }]
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
  return (
    <button type="button" data-pile={shelf.id} data-count={files.length} onClick={(event) => (chime('open'), heroOpen(event, onOpen))}
      onPointerMove={(event) => { if (!heard.current && realMove(event)) (heard.current = true), chime('fan') }}
      onPointerLeave={() => (heard.current = false)}
      className="files-pile group/pile flex w-[82%] max-w-[280px] min-w-0 cursor-pointer flex-col gap-2.5 justify-self-center text-center outline-none">
      {/* 82% of its column's width but as tall as a 5:4 shelf the column's full width: narrower, never shorter. */}
      <span className="files-pile-box relative block aspect-[41/40] w-full">
        {top.map((one, at) => {
          const fan = FANS[top.length][at]
          return (
            <span key={one.src} className="files-pile-cover absolute bottom-[24%] left-1/2 block w-[42%] overflow-hidden rounded-[4px] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.25)] ring-1 ring-foreground/10"
              style={{ '--x': `${fan.x}%`, '--r': `${fan.r}deg`, '--y': `${fan.y}%` } as React.CSSProperties}>
              <Cover one={one} className="aspect-[3/4]" />
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
      <span className="flex min-w-0 items-baseline justify-center gap-1.5 px-0.5 text-body">
        <span className="font-medium text-foreground">{shelf.label}</span>{' '}
        <span className="text-muted-foreground tabular-nums">· {plural(files.length, shelf.one, shelf.many)}</span>
      </span>
    </button>
  )
}

/** How wide a Recent card is, and the room between: the Books shelf's (pdf.css, .pdf-library-shelf). */
export const RECENT_CARD = 136
export const RECENT_GAP = 16

/**
 * The last few opened or added, any kind, as the Books shelf draws its books: a face standing up, the name in the
 * serif, a quiet line saying what it is and when. As many across as fit, two lines at most, and "Show all" for the
 * rest, in Table by last opened.
 */
export function RecentGrid({ files, across, when, onOpen, menuFor, onShowAll, more }: {
  files: Media[]
  across: number
  /** What its quiet line says of when: "Opened today", "Added 9 Nov", after its kind ("Image · Opened today"). */
  when: (one: Media) => string
  onOpen: (one: Media, event: React.MouseEvent) => void
  menuFor: (one: Media) => RowItem[]
  onShowAll: () => void
  /** Whether there are more than the grid holds. */
  more: boolean
}): React.JSX.Element {
  return (
    <section data-files-recent className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body font-medium text-foreground">Recent</h3>
        {more && (
          <button type="button" data-files-recent-all onClick={onShowAll}
            className="cursor-pointer rounded-sm text-control text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">Show all</button>
        )}
      </div>
      <div data-files-recent-grid className="grid" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap: `${RECENT_GAP * 1.5}px ${RECENT_GAP}px` }}>
        {files.map((one) => (
          <RowMenu key={one.src} items={menuFor(one)}>
            <button type="button" data-recent-file={one.kind} data-src={one.src} onClick={(event) => onOpen(one, event)} className="pdf-book min-w-0">
              <span className={one.kind === 'pdf' ? 'pdf-book-cover' : 'files-recent-face'} data-pdf-peek={one.kind === 'pdf' && !one.gone ? one.src : undefined} data-pdf-peek-name={one.kind === 'pdf' ? one.name : undefined} data-pdf-peek-scrub={one.kind === 'pdf' && !one.gone ? '' : undefined}>
                <Cover one={one} className="size-full" />
              </span>
              <span dir="auto" data-media-name className={`pdf-book-title ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
              {/* Its kind first, quietly, so a picture is told from a PDF or a book whatever its face shows (the user, 15 Nov 2026). */}
              <span className="pdf-book-meta">{kindWord(one)} · {when(one)}</span>
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
function grouped(files: Media[], headOf: (one: Media) => string, across: number): Line[] {
  const out: Line[] = []
  let at = 0
  while (at < files.length) {
    const head = headOf(files[at])
    let end = at
    while (end < files.length && headOf(files[end]) === head) end++
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
  grouped(files, (one) => monthOf(one.at), across).flatMap((line) => ('files' in line ? [[line.from, line.from + line.files.length] as [number, number]] : []))

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
/** The island's surface, as ui.tsx's Island draws it (Queue's "Up next"), its sides on every piece. */
const ISLAND_SURFACE = 'mf-island overflow-hidden border-x bg-accent/25'

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
    // The page's scroller, found even while it is held still because the shelves fit (scrollerOf).
    const scroller = mark ? scrollerOf(mark) : null
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
export const whereOf = (one: Media): string => (one.gone ? 'File gone from the book' : one.uses.length ? `In ${one.uses[0].title || 'New note'}${one.uses.length > 1 ? ` and ${num(one.uses.length - 1)} more` : ''}` : one.how === 'attachment' && one.letGoAt ? `Unlinked ${letGoWhen(one.letGoAt)}` : one.added ? 'In no note yet' : 'In no note')
/** When the last note let a file go: today, yesterday, or since the day. */
export const letGoWhen = (at: string): string => ((days) => (days === 0 ? 'today' : days === -1 ? 'yesterday' : `since ${dayMonth(at)}`))(daysFromToday(at))

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
  const ways = useTileWays(menuFor, onClick)
  const lines = useMemo(() => grouped(files, (one) => monthOf(one.at), across), [files, across])
  // Pinched in past Photos' nine across: every picture in one close mosaic, no headings, as Photos' "Years" and
  // "Months": the first picture of each month (or year) carries its name on a small pill over it.
  const dense = across >= DENSE.years ? 'years' : across >= DENSE.months ? 'months' : null
  if (dense) return <PictureMosaic files={files} across={across} by={dense} cursor={cursor} chosen={chosen} keyOf={keyOf} ways={ways} />
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
              <Square key={key} one={one} here={here} picked={picked} ways={ways} />
            )
          })}
        </div>
      )}
    </VirtualList>
    </>
  )
}

/** How many across a grid of pictures turns into Photos' close mosaics: by month, then by year. */
export const DENSE = { months: 15, years: 30 }
const YEAR = new Intl.DateTimeFormat('en-GB', { year: 'numeric' })
const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' })

/**
 * Pictures as Photos' "Months" and "Years": one close mosaic of small squares, a hairline apart, newest first, only
 * the rows in sight drawn; a small pill names each month ("Feb 2026") or year ("2024") on its first picture. Each
 * square is the same tile (its menu, its click, its pick), only smaller and without its name rising on hover.
 */
function PictureMosaic({ files, across, by, cursor, chosen, keyOf, ways }: { files: Media[]; across: number; by: 'months' | 'years'; cursor: number; chosen: string[]; keyOf: (one: Media) => string; ways: TileWays }): React.JSX.Element {
  const name = (one: Media): string => (one.at ? (by === 'years' ? YEAR : MONTH_SHORT).format(new Date(one.at)) : 'Undated')
  const lines = useMemo(() => {
    const out: { key: string; files: Media[]; from: number }[] = []
    for (let from = 0; from < files.length; from += across) out.push({ key: files[from].src, files: files.slice(from, from + across), from })
    return out
  }, [files, across])
  const gap = by === 'years' ? 1 : 2
  const cursorKey = files[cursor] ? keyOf(files[cursor]) : null
  return (
    <VirtualList items={lines} keyOf={(line) => line.key} rowClass="" estimate={40}
      holds={(line, key) => line.files.some((one) => keyOf(one) === key)}
      cursor={cursorKey ? lines.findIndex((line) => line.files.some((one) => keyOf(one) === cursorKey)) : undefined}>
      {(line) => (
        <div data-mosaic={by} className="grid" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap, paddingBottom: gap }}>
          {line.files.map((one, at) => {
            const index = line.from + at
            const label = index === 0 || name(files[index - 1]) !== name(one) ? name(one) : null
            return (
              <span key={keyOf(one)} className="relative block">
                <Square one={one} here={index === cursor} picked={chosen.includes(keyOf(one))} ways={ways} small />
                {label && <span data-mosaic-label className="pointer-events-none absolute top-1 left-1 z-[1] rounded-full bg-background/90 px-1.5 py-px text-[11px] font-semibold whitespace-nowrap text-foreground shadow-sm">{label}</span>}
              </span>
            )
          })}
        </div>
      )}
    </VirtualList>
  )
}

/** The page's ways in, held still for its tiles, as FilesTable holds them for its rows. */
type Ways = { menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void; onUse?: (use: MediaUse, src: string) => void }
export type TileWays = React.RefObject<Ways>
export const useTileWays = (menuFor: Ways['menuFor'], onClick: Ways['onClick'], onUse?: Ways['onUse']): TileWays => {
  const ways = useRef<Ways>({ menuFor, onClick, onUse })
  ways.current = { menuFor, onClick, onUse }
  return ways
}

/**
 * A picture as Photos draws it: a square, its name and note rising out of a frosted foot when pointed at. Drawn again
 * only when what it shows changes, its menu made as it opens: drawn afresh on each frame of a scroll, with a menu
 * built for each, the squares in sight cost a frame its whole budget (qa/files-table.mjs).
 */
const Square = memo(function Square({ one, here, picked, ways, small = false }: { one: Media; here: boolean; picked: boolean; ways: TileWays; /** In a close mosaic: squarer corners, and no name rising on hover. */ small?: boolean }): React.JSX.Element {
  return (
    <RowMenu items={() => ways.current.menuFor(one)}>
      <button type="button" data-media={one.kind} data-src={one.src} data-id={one.src} data-cursor={here || undefined} data-picked={picked || undefined}
        onClick={(event) => ways.current.onClick(one, event)}
        className={`files-square group/sq relative block aspect-square w-full cursor-pointer overflow-hidden ${small ? 'rounded-[2px]' : 'rounded-[6px]'} bg-accent text-left outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[6px] after:ring-inset ${picked ? 'after:bg-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] after:ring-2 after:ring-[var(--tt-brand-color-400)]' : here ? 'after:ring-2 after:ring-ring' : 'after:ring-1 after:ring-foreground/10'}`}>
        <Cover one={one} className="size-full" />
        {(one.kind === 'gif' || one.kind === 'video') && <span className="absolute top-1.5 left-1.5 rounded-[3px] bg-background px-1 text-[11px] font-medium">{kindWord(one)}</span>}
        {/* Pointed at, its name rises out of a frosted foot, the blur thinning as it rises (the Map's own): no band. */}
        {!small && <span data-square-foot className="files-square-foot pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end px-2 pt-8 pb-1.5 text-white">
          <span aria-hidden className="mf-blur-edge files-square-blur"><span /><span /><span /><span /></span>
          {/* A picture with no name of its own is called after its note: then the note is said once. */}
          {nameOf(one) !== one.uses[0]?.title && <span dir="auto" data-media-name className={`relative truncate text-xs font-medium ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>}
          <span data-media-where className={`relative truncate ${nameOf(one) !== one.uses[0]?.title ? 'text-[11px] text-white' : 'text-xs font-medium'}`}>{whereOf(one)}</span>
        </span>}
      </button>
    </RowMenu>
  )
})

/**
 * Recordings as Voice Memos lists them: by day, newest first, one line each
 * with its player (play, its waveform and its length), its name, the note it
 * is in and the time it was made.
 */
export function AudioDays({ files, cursor, chosen, keyOf, menuFor, onClick, onUse }: {
  files: Media[]; cursor: number; chosen: string[]; keyOf: (one: Media) => string
  menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void
}): React.JSX.Element {
  const lines = useMemo(() => grouped(files, (one) => dayOf(one.at), 1), [files])
  const ways = useTileWays(menuFor, onClick, onUse)
  const cursorKey = files[cursor] ? keyOf(files[cursor]) : null
  return (
    <>
    <StuckHead lines={lines} />
    <VirtualList items={lines} keyOf={(line) => line.key} rowClass="" estimate={64}
      sizeOf={(line) => ('head' in line ? HEAD : 64)}
      holds={(line, key) => 'files' in line && keyOf(line.files[0]) === key}
      cursor={cursorKey ? lines.findIndex((line) => 'files' in line && keyOf(line.files[0]) === cursorKey) : undefined}>
      {(line, index) => {
        if ('head' in line) return <Head line={line} />
        const one = line.files[0]
        const key = keyOf(one)
        const here = line.from === cursor
        const picked = chosen.includes(key)
        const first = 'head' in lines[index - 1]
        const after = lines[index + 1]
        const last = !after || 'head' in after
        return <AudioPiece key={key} one={one} here={here} picked={picked} island={first && last ? 'one' : first ? 'top' : last ? 'end' : 'mid'} ways={ways} />
      }}
    </VirtualList>
    </>
  )
}

/** A recording's row, one piece of its day's island (Queue's "Up next"): the first with its top, the last with its foot. Drawn again only when it changes (Square). */
const AudioPiece = memo(function AudioPiece({ one, here, picked, island, ways }: {
  one: Media; here: boolean; picked: boolean; island: 'one' | 'top' | 'mid' | 'end'; ways: TileWays
}): React.JSX.Element {
  const onClick = (event: React.MouseEvent): void => ways.current.onClick(one, event)
  const onUse = (use: MediaUse): void => ways.current.onUse?.(use, one.src)
  return (
    <div data-audio-island={island} className={`files-audio-piece ${ISLAND_SURFACE} ${island === 'one' || island === 'top' ? 'rounded-t-xl border-t' : ''} ${island === 'one' || island === 'end' ? 'rounded-b-xl border-b' : ''}`}>
    <RowMenu items={() => ways.current.menuFor(one)}>
      <div data-media="audio" data-src={one.src} data-id={one.src} data-cursor={here || undefined} data-picked={picked || undefined} role="button" tabIndex={-1}
        onClick={onClick}
        className={`files-audio-row grid min-h-[60px] cursor-pointer items-center gap-x-4 rounded-md px-3 py-3 transition-[background-color] duration-150 ${picked ? 'bg-[color-mix(in_srgb,var(--tt-brand-color-400)_14%,transparent)]' : here ? 'bg-accent/50' : 'hover:bg-accent/50'}`}>
        <span className="flex min-w-0 flex-col">
          <span dir="auto" data-media-name className={`truncate text-body font-medium text-foreground ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
          {one.uses.length ? (
            <button type="button" data-media-use data-media-where className="w-fit max-w-full cursor-pointer truncate text-left text-xs text-muted-foreground underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground" onClick={(event) => (event.stopPropagation(), onUse(one.uses[0]))}>{whereOf(one)}</button>
          ) : <span data-media-where className="text-xs text-muted-foreground">{whereOf(one)}</span>}
        </span>
        {/* Played where it sits: a press on the player is the player's, never the row's (which opens the note). */}
        <span className="files-audio-player min-w-0" onClick={(event) => event.stopPropagation()}><SoundPlayer src={one.src} className="w-full" inline /></span>
        <span className="files-audio-time text-right text-xs text-muted-foreground tabular-nums">{one.at ? TIME.format(new Date(one.at)) : ''}</span>
      </div>
    </RowMenu>
    </div>
  )
})

/** A book as the Books shelf draws it: its first page standing up, its title in the serif, a quiet line under. */
const BookTile = memo(function BookTile({ one, here, picked, ways }: { one: Media; here: boolean; picked: boolean; ways: TileWays }): React.JSX.Element {
  const onClick = (event: React.MouseEvent): void => ways.current.onClick(one, event)
  const cover = usePdfCover(one.gone ? null : one.src, one.name)
  return (
    <RowMenu items={() => ways.current.menuFor(one)}>
      <button type="button" data-media="pdf" data-src={one.src} data-id={one.src} data-cursor={here || undefined} data-picked={picked || undefined} onClick={onClick}
        className={`pdf-book min-w-0${here ? ' is-picked' : ''}${picked ? ' is-chosen' : ''}`}>
        <span className="pdf-book-cover" data-pdf-peek={one.gone ? undefined : one.src} data-pdf-peek-name={one.name} data-pdf-peek-scrub={one.gone ? undefined : ''}>
          {cover?.image ? <img src={cover.image} alt="" draggable={false} /> : <span className="pdf-book-blank"><BookOpen className="size-6" /></span>}
        </span>
        <span dir="auto" data-media-name className={`pdf-book-title ${one.private ? 'private-text' : ''}`}>{cover?.title || nameOf(one)}</span>
        <span data-media-where className="pdf-book-meta">{whereOf(one)}</span>
      </button>
    </RowMenu>
  )
})

/** A video tile at its narrowest, wide as a film is (16:9), and the room between two. */
export const VIDEO_TILE = 232
export const VIDEO_GAP = 16

/** Videos whose length is being read from the file, one at a time: a page of them never opens fifty files at once. */
let lengthTurn: Promise<void> = Promise.resolve()
const lengthAsked = new Set<string>()
function readLength(src: string): void {
  if (lengthAsked.has(src)) return
  lengthAsked.add(src)
  lengthTurn = lengthTurn.then(() => new Promise<void>((done) => {
    // Only what its length needs is read (its header), never its frames, and it is let go at once.
    const film = document.createElement('video')
    film.preload = 'metadata'
    film.muted = true
    const read = (): void => {
      if (Number.isFinite(film.duration) && film.duration > 0) keepLength(src, Math.round(film.duration * 100) / 100)
      film.removeAttribute('src')
      film.load()
      done()
    }
    film.addEventListener('loadedmetadata', read, { once: true })
    film.addEventListener('error', read, { once: true })
    film.src = src
  }))
}
const heardPlace = (on: () => void): (() => void) => (window.addEventListener('haligtree:media-opened', on), () => window.removeEventListener('haligtree:media-opened', on))

/** A video's length and how far it was watched, as the list or this window last heard; its length read once if not known. */
export function usePlace(one: Media): Place | null {
  const said = useSyncExternalStore(heardPlace, () => ((place) => (place ? `${place.seconds}|${place.played ?? ''}|${place.playedAt ?? ''}` : ''))(placeOf(one)))
  useEffect(() => void (!said && !one.gone && readLength(one.src)), [said, one.src, one.gone])
  return useMemo(() => {
    if (!said) return null
    const [seconds, played, playedAt] = said.split('|')
    return { seconds: Number(seconds), played: played ? Number(played) : undefined, playedAt: playedAt || undefined }
  }, [said])
}

/** Begun and not yet watched to its end (the last two seconds count as the end). */
export const halfWatched = (place: Place | null): boolean => !!place?.played && place.played > 1 && place.played < place.seconds - 2
/** "8 min left", "16 s left", "1 h 5 min left", "2 h left". */
const leftOf = (place: Place): string => {
  const left = Math.max(0, place.seconds - (place.played ?? 0))
  if (left < 60) return `${Math.ceil(left)} s left`
  const minutes = Math.round(left / 60)
  return minutes < 60 ? `${minutes} min left` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''} left`
}

/** How far it was watched: a thin line along the picture's foot, white over a faint track. Nothing for one not begun. */
function Watched({ place }: { place: Place | null }): React.JSX.Element | null {
  if (!halfWatched(place)) return null
  return (
    <span aria-hidden data-video-progress={(place!.played! / place!.seconds).toFixed(3)} className="files-video-progress">
      <span style={{ width: `${(place!.played! / place!.seconds) * 100}%` }} />
    </span>
  )
}

/** A video's frame on its tile: Quick Look's, or its own first frame; a portrait one whole, never cropped. */
function VideoFace({ one, large = false }: { one: Media; large?: boolean }): React.JSX.Element {
  const face = useFileFace(one, large)
  return <span className="files-video-face"><FileFace one={one} face={face} tiny /></span>
}

/**
 * The Videos tab, in Files' own look: in front, the video last watched (or else the newest), its frame large, its
 * name, its length, its note and how far it got; under it "Carry on watching", the others begun and not finished,
 * newest watched first; then, under "Every video", media-view.tsx lays every video out as wide tiles (VideoTile).
 */
export function VideoFront({ files, across, onPlay, onUse, menuFor }: { files: Media[]; /** As many tiles as the grid under it has across. */ across: number; onPlay: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void; /** Each video's one right-click menu, the grid's own. */ menuFor: (one: Media) => RowItem[] }): React.JSX.Element | null {
  // This window's own news too: a video just stopped is in front before the list is read again.
  useSyncExternalStore(heardPlace, () => files.map((one) => placeOf(one)?.playedAt ?? '').join('|'))
  const byWatched = files.filter((one) => !one.gone && placeOf(one)?.playedAt).sort((a, b) => (placeOf(b)!.playedAt ?? '').localeCompare(placeOf(a)!.playedAt ?? ''))
  // Else the newest (the list comes newest first).
  const front = byWatched[0] ?? files.find((one) => !one.gone)
  if (!front) return null
  const rest = byWatched.filter((one) => one !== front && halfWatched(placeOf(one))).slice(0, across)
  return (
    <>
      <div className="flex flex-col gap-7 pb-7">
        <RowMenu items={() => menuFor(front)}><Front one={front} onWatch={onPlay} onUse={onUse} /></RowMenu>
        {rest.length > 0 && (
          <section data-video-carry className="flex flex-col gap-2">
            <h3 className="text-body font-medium text-foreground">Carry on watching</h3>
            <div className="files-video-row" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))` }}>
              {rest.map((one) => <RowMenu key={one.src} items={() => menuFor(one)}><VideoCard one={one} onClick={onPlay} carry /></RowMenu>)}
            </div>
          </section>
        )}
      </div>
      <h3 className="pb-2 text-body font-medium text-foreground">Every video</h3>
    </>
  )
}

/** The video in front: its frame large, its name and a quiet line over a soft shade at its foot, a round play beside them. */
function Front({ one, onWatch, onUse, ...menu }: { one: Media; onWatch: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void } & React.ComponentProps<'section'>): React.JSX.Element {
  const place = usePlace(one)
  const begun = halfWatched(place)
  const note = one.uses[0]
  return (
    // `menu`: what its right-click menu (RowMenu) hands it.
    <section {...menu} data-video-front data-src={one.src} className="files-video-front">
      <button type="button" aria-label={`${begun ? 'Carry on with' : 'Play'} ${nameOf(one)}`} onClick={(event) => onWatch(one, event)} className="files-video-front-face">
        <VideoFace one={one} large />
      </button>
      <span className="files-video-front-foot">
        <span aria-hidden className="mf-blur-edge files-video-front-blur"><span /><span /><span /><span /></span>
        <span aria-hidden className="files-video-front-play"><Play className="size-4 translate-x-px fill-current" /></span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span dir="auto" data-media-name className={`truncate font-heading text-title font-medium ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
          <span className="flex min-w-0 items-baseline gap-1.5 text-control text-white">
            {note ? (
              <button type="button" data-media-use className="min-w-0 cursor-pointer truncate underline decoration-white/35 underline-offset-2 hover:decoration-white" onClick={() => onUse(note, one.src)}>{note.title || 'New note'}</button>
            ) : <span className="truncate">{whereOf(one)}</span>}
            {place && <span className="shrink-0 tabular-nums">· {clock(place.seconds)}</span>}
            {begun && <span data-video-left className="shrink-0 tabular-nums">· {leftOf(place!)}</span>}
          </span>
        </span>
        <Watched place={place} />
      </span>
    </section>
  )
}

/** A video as a wide tile: its frame with soft corners and how far it was watched along its foot, its name under, a quiet line. */
function VideoCard({ one, onClick, carry = false, here = false, picked = false, ...menu }: { one: Media; onClick: (one: Media, event: React.MouseEvent) => void; carry?: boolean; here?: boolean; picked?: boolean } & Omit<React.ComponentProps<'button'>, 'onClick'>): React.JSX.Element {
  const place = usePlace(one)
  return (
    <button {...menu} type="button" data-media={carry ? undefined : 'video'} data-video-card={carry ? 'carry' : 'grid'} data-src={one.src} data-id={carry ? undefined : one.src} data-cursor={here || undefined} data-picked={picked || undefined}
      onClick={(event) => onClick(one, event)} className="files-video-card group/vc min-w-0 cursor-pointer text-left outline-none">
      <span className={`files-video-pic ${picked ? 'is-picked' : here ? 'is-here' : ''}`}>
        <VideoFace one={one} />
        {place && <span className="files-video-length tabular-nums">{clock(place.seconds)}</span>}
        <Watched place={place} />
      </span>
      <span dir="auto" data-media-name className={`truncate pt-2 text-body font-medium text-foreground ${one.private ? 'private-text' : ''}`}>{nameOf(one)}</span>
      <span data-media-where className={`truncate text-xs text-muted-foreground ${one.uses[0]?.private ? 'private-text' : ''}`}>
        {carry && halfWatched(place) ? `${leftOf(place!)} · ${one.uses[0]?.title || whereOf(one)}` : whereOf(one)}
      </span>
    </button>
  )
}

/** One of Videos' grid tiles, drawn again only when what it shows changes, its menu made as it opens (Square). */
export const VideoTile = memo(function VideoTile({ one, here, picked, ways }: { one: Media; here: boolean; picked: boolean; ways: TileWays }): React.JSX.Element {
  return (
    <RowMenu items={() => ways.current.menuFor(one)}>
      <VideoCard one={one} here={here} picked={picked} onClick={(item, event) => ways.current.onClick(item, event)} />
    </RowMenu>
  )
})

/** When the last note let a file go, as a heading: "Let go today", "Let go yesterday", "Let go on 6 Nov". */
const letGoHead = (one: Media): string => {
  if (!one.letGoAt) return 'Let go'
  const days = daysFromToday(one.letGoAt)
  return days === 0 ? 'Let go today' : days === -1 ? 'Let go yesterday' : `Let go on ${dayMonth(one.letGoAt)}`
}
const KIND_ORDER: Record<Shelf, number> = { picture: 0, audio: 1, pdf: 2, video: 3, document: 4 }
/** Unlinked, in the order it is drawn: by the day it was let go, newest first; in a day, pictures, recordings, books, videos, documents. */
export const unlinkedOrder = (files: Media[]): Media[] => {
  const day = new Map(files.map((one) => [one.src, one.letGoAt ? -daysFromToday(one.letGoAt) : Number.MAX_SAFE_INTEGER]))
  return [...files].sort((a, b) => day.get(a.src)! - day.get(b.src)! || KIND_ORDER[shelfOf(a)] - KIND_ORDER[shelfOf(b)] || (b.letGoAt ?? '').localeCompare(a.letGoAt ?? '') || (b.at ?? '').localeCompare(a.at ?? ''))
}

type UnlinkedLine = { key: string; head: string; count: number } | { key: string; files: Media[]; from: number; shelf: Shelf; island?: 'one' | 'top' | 'mid' | 'end' }

/** Unlinked's lines: a heading for each day, then that day's pictures as squares, recordings as an island, books as covers. */
function unlinkedLines(files: Media[], across: number, books: number): UnlinkedLine[] {
  const out: UnlinkedLine[] = []
  for (const line of grouped(files, letGoHead, Number.MAX_SAFE_INTEGER)) {
    if ('head' in line) {
      out.push(line)
      continue
    }
    for (const shelf of ['picture', 'audio', 'pdf', 'video', 'document'] as Shelf[]) {
      const these = line.files.filter((one) => shelfOf(one) === shelf)
      if (!these.length) continue
      const from = line.from + line.files.indexOf(these[0])
      // Videos and documents as squares, as the pictures are: each its face.
      const wide = shelf === 'pdf' ? books : shelf === 'audio' ? 1 : across
      for (let at = 0; at < these.length; at += wide) {
        const island = shelf !== 'audio' ? undefined : these.length === 1 ? 'one' : at === 0 ? 'top' : at === these.length - 1 ? 'end' : 'mid'
        out.push({ key: these[at].src, files: these.slice(at, at + wide), from: from + at, shelf, island })
      }
    }
  }
  return out
}
/** Where each of Unlinked's lines starts and ends among the files, for the keys up and down. */
export const unlinkedSpans = (files: Media[], across: number, books: number): [number, number][] =>
  unlinkedLines(files, across, books).flatMap((line) => ('files' in line ? [[line.from, line.from + line.files.length] as [number, number]] : []))

/** A book on the shelf at its narrowest (8.5rem, as the Books shelf has it), and the room between two. */
export const BOOK = 136
export const BOOK_GAP = 16

/**
 * Unlinked: what the last note let go of, by the day it went, each kind drawn as its own view draws it (pictures as
 * the Pictures squares, recordings as the Audio islands, books as the Books covers), so the page reads the same.
 * Only the rows in sight are drawn.
 */
export function UnlinkedDays({ files, across, books, cursor, chosen, keyOf, menuFor, onClick, onUse }: {
  files: Media[]; across: number; books: number; cursor: number; chosen: string[]; keyOf: (one: Media) => string
  menuFor: (one: Media) => RowItem[]; onClick: (one: Media, event: React.MouseEvent) => void; onUse: (use: MediaUse, src: string) => void
}): React.JSX.Element {
  const lines = useMemo(() => unlinkedLines(files, across, books), [files, across, books])
  const ways = useTileWays(menuFor, onClick, onUse)
  const cursorKey = files[cursor] ? keyOf(files[cursor]) : null
  const size = (line: UnlinkedLine): number => ('head' in line ? HEAD : line.shelf === 'audio' ? 64 : line.shelf === 'pdf' ? 260 : PICTURE + PICTURE_GAP)
  return (
    <>
    <StuckHead lines={lines as Line[]} />
    <VirtualList items={lines} keyOf={(line) => line.key} rowClass="" estimate={PICTURE + PICTURE_GAP} sizeOf={size}
      holds={(line, key) => 'files' in line && line.files.some((one) => keyOf(one) === key)}
      cursor={cursorKey ? lines.findIndex((line) => 'files' in line && line.files.some((one) => keyOf(one) === cursorKey)) : undefined}>
      {(line) => {
        if ('head' in line) return <Head line={line} />
        const tile = (one: Media, at: number): React.JSX.Element => {
          const key = keyOf(one)
          const here = line.from + at === cursor
          const picked = chosen.includes(key)
          return line.shelf === 'pdf' ? <BookTile key={key} one={one} here={here} picked={picked} ways={ways} />
            : line.shelf === 'audio' ? <AudioPiece key={key} one={one} here={here} picked={picked} island={line.island ?? 'one'} ways={ways} />
            : <Square key={key} one={one} here={here} picked={picked} ways={ways} />
        }
        // A day's recordings end their island with the room a line of squares leaves under it.
        if (line.shelf === 'audio') return <div style={{ paddingBottom: line.island === 'end' || line.island === 'one' ? PICTURE_GAP : 0 }}>{tile(line.files[0], 0)}</div>
        return (
          // Books' covers start on the heading's left edge, as the squares do: the tile's own side padding stands down here.
          <div className={`grid ${line.shelf === 'pdf' ? '[&_.pdf-book]:px-0' : ''}`} style={line.shelf !== 'pdf'
            ? { gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap: PICTURE_GAP, paddingBottom: PICTURE_GAP }
            : { gridTemplateColumns: `repeat(${books}, minmax(0, 1fr))`, gap: BOOK_GAP, paddingBottom: BOOK_GAP }}>
            {line.files.map(tile)}
          </div>
        )
      }}
    </VirtualList>
    </>
  )
}
