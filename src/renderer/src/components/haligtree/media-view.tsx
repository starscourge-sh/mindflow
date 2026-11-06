import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStepped } from '@/lib/nav'
import { AudioLines, Image as ImageIcon, ImagePlay, Layers } from 'lucide-react'
import { FileText } from '@/components/ui/icons'
import { call, unloaded, useLive } from '@/lib/haligtree'
import { smallPicture } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { usePdfCover } from '@/components/pdf/pdf-cover'
import { PdfLibrary } from '@/components/pdf/pdf-library'
import { PictureRow } from './picture-row'
import { GRACE } from '@/components/pdf/pdf-peek'
import { canSplit, openAside } from '@/lib/split'
import { chime } from '@/lib/sound'
import { pictureLines } from '@/lib/picture-actions'
import { Empty, Page, refuse, toast, VirtualList } from './ui'
import { Chip } from './display'
import { ListSearch, tileClass } from './note-list'
import { SoundPlayer, soundTitle } from './sound-player'
import { RowMenu, type RowItem } from './row-menu'
import type { Media, MediaKind } from '../../../../main/media'

/** The kinds, as the chips over the grid name them. */
const KINDS: { id: MediaKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'picture', label: 'Pictures', icon: ImageIcon },
  { id: 'gif', label: 'GIFs', icon: ImagePlay },
  { id: 'pdf', label: 'PDFs', icon: FileText },
  { id: 'audio', label: 'Audio', icon: AudioLines }
]
/** A tile as wide as a note's in Gems' grid, with the same room between. */
const TILE = 184
const GAP = 12

const readMedia = (): Promise<Media[]> => call<Media[]>('media:list')

let nextKind: MediaKind | null = null
const takeKind = (): MediaKind | null => ((kind) => ((nextKind = null), kind))(nextKind)
/** Media, opened (or already open) on one kind. */
export function showMediaKind(kind: MediaKind): void {
  nextKind = kind
  window.dispatchEvent(new CustomEvent('haligtree:media-kind', { detail: kind }))
}

/**
 * Every picture, screenshot, GIF, PDF and recording kept in the book's notes,
 * as a grid, newest note first. Pointed at, a tile says the note it is in;
 * clicked, that note opens on it (⌥-click: to the side).
 */
export function MediaView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(readMedia, [] as Media[])
  const [query, setQuery] = useState('')
  // Opened on a kind ("Show all" under Continue reading opens it on the PDFs), else every kind.
  const [kind, setKind] = useState<'all' | MediaKind>(() => takeKind() ?? 'all')
  useEffect(() => {
    const on = (event: Event): void => setKind((event as CustomEvent<MediaKind>).detail)
    window.addEventListener('haligtree:media-kind', on)
    return () => window.removeEventListener('haligtree:media-kind', on)
  }, [])
  useStepped(kind, setKind)
  // A shared deck's pictures (hundreds of paintings) wait under their own chip, so the book's own stay in view.
  const [decks, setDecks] = useState(false)
  const anyDeck = all.some((one) => one.deck)
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((one) => !!one.deck === decks && (kind === 'all' || one.kind === kind) &&
      words.every((word) => `${one.title} ${one.name} ${one.near}`.toLowerCase().includes(word)))
  }, [all, query, kind, decks])

  // How many tiles fit across, worked out from the grid's own width.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    setWidth(element.clientWidth)
    const watch = new ResizeObserver(() => setWidth(element.clientWidth))
    watch.observe(element)
    return () => watch.disconnect()
  }, [all.length > 0, kind === 'pdf'])
  const across = Math.max(1, Math.floor((width + GAP) / (TILE + GAP)))
  const lines = useMemo(() => {
    const out: { key: string; tiles: Media[] }[] = []
    for (let at = 0; at < shown.length; at += across) out.push({ key: `${shown[at].type}:${shown[at].id}:${shown[at].src}`, tiles: shown.slice(at, at + across) })
    return out
  }, [shown, across])

  const open = (one: Media): void => {
    onOpen(one.type, one.id)
    headingIn(one.type, one.id, one.src)
  }

  // The kinds, as Gems' are: one on at a time, pressed again to show every kind.
  const kinds = (
    <div data-media-kinds className="flex flex-wrap gap-1 pt-4 pb-3 text-xs">
      {KINDS.map((one) => (
        <Chip key={one.id} on={kind === one.id} onClick={() => (chime(kind === one.id ? 'off' : 'on'), setKind(kind === one.id ? 'all' : one.id))} mark={<one.icon className="size-3.5" />}>{one.label}</Chip>
      ))}
      {anyDeck && (
        <span data-media-decks="" className="contents"><Chip on={decks} onClick={() => (chime(decks ? 'off' : 'on'), setDecks(!decks))} mark={<Layers className="size-3.5" />}>Deck pictures</Chip></span>
      )}
    </div>
  )
  const library = all.length > 0 && kind === 'pdf'
  // The newest pictures as a flowing row over the grid, for looking; the grid below is for finding.
  const recent = useMemo(() => (query.trim() || decks || (kind !== 'all' && kind !== 'picture') ? [] : shown.filter((one) => one.kind === 'picture')), [shown, query, decks, kind])
  const recentItems = useMemo(() => recent.map((one) => ({ src: () => smallPicture(one.src, true), title: one.title || 'Untitled', aspect: 4 / 3 })), [recent])
  return (
    <Page title="Media" dock={library} waiting={unloaded(all)} count={unloaded(all) || !all.length ? undefined : shown.length} unit={['file', 'files']}
      search={all.length > 0 && <ListSearch value={query} placeholder="Find by note, name or words" onChange={setQuery} onDone={() => shown[0] && open(shown[0])} />}>
      {library ? (
        // PDFs as a library: a shelf of covers, each book once, the picked one's panel docked at the page's edge.
        <PdfLibrary query={query} top={kinds} />
      ) : all.length ? (
        <div ref={box} data-media-grid className="mx-5 mb-4">
          {kinds}
          {recent.length > 0 && (
            <section data-recent-pictures className="mb-4 flex flex-col gap-2">
              <h3 className="text-body font-medium text-foreground">Recent pictures</h3>
              <PictureRow key={recent.map((one) => `${one.id}:${one.src}`).join()} items={recentItems} height={250} cardHeight={0.72} direct counter="slash" label="Recent pictures" onOpen={(at) => recent[at] && open(recent[at])} menuFor={(at) => mediaMenu(recent[at], () => open(recent[at]))} />
            </section>
          )}
          {shown.length ? (
            <VirtualList items={lines} keyOf={(line) => line.key} holds={(line, key) => line.tiles.some((one) => `${one.type}:${one.id}:${one.src}` === key)} estimate={TILE * 0.75 + 52 + GAP} rowClass="">
              {(line) => (
                <div className="grid" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))`, gap: GAP, paddingBottom: GAP }}>
                  {line.tiles.map((one) => <Tile key={`${one.type}:${one.id}:${one.src}`} one={one} onOpen={() => open(one)} />)}
                </div>
              )}
            </VirtualList>
          ) : (
            <p className="my-4 text-control text-muted-foreground">
              {query.trim() ? <>Nothing here has “{query.trim()}” in its note, its name or the words around it.</> : <>No {KINDS.find((one) => one.id === kind)?.label.toLowerCase()} in your notes yet.</>}
            </p>
          )}
        </div>
      ) : unloaded(all) ? null : (
        <Empty title="No pictures or files yet">
          Paste or drop a picture, a screenshot, a GIF, a PDF or a recording into any note, gem, page or Journal day. Each one shows up here, with the note it lives in.
        </Empty>
      )}
    </Page>
  )
}

/** What a file's tile says it is, in place of a picture. */
const WORD: Record<MediaKind, string> = { picture: 'Picture', gif: 'GIF', pdf: 'PDF', audio: 'Recording' }

/** A picture's or a file's right-click menu, on its tile and in the "Recent pictures" row. */
export function mediaMenu(one: Media, onOpen: () => void): RowItem[] {
  const picture = one.kind === 'picture' || one.kind === 'gif'
  return [
    { label: 'Open note', keys: '↵', run: onOpen },
    canSplit() && { label: 'Open to the side', keys: '⌥-click', run: () => (openAside(one.type, one.id), headingIn(one.type, one.id, one.src)) },
    'separator',
    { label: 'Copy link', hint: 'Paste it into any note to show it there too', run: () => void copyMedia(one) },
    picture && { label: 'Copy image', run: () => void window.api.copyImage(one.src).then((done) => (done ? (chime('copy'), toast('Copied the picture')) : refuse('Could not copy it', 'error'))) },
    // Its words' lines under one, as on a picture in a note.
    picture && pictureLines(one.src).length > 0 && { label: 'Text in it', items: pictureLines(one.src) },
    { label: 'Show in Finder', run: () => void window.api.showFile(one.src) }
  ]
}

function Tile({ one, onOpen }: { one: Media; onOpen: () => void }): React.JSX.Element {
  // A PDF is named by the title it carries, as the reader names it, and shows its first page.
  const cover = usePdfCover(one.kind === 'pdf' ? one.src : null, one.name)
  // A recording by its name without ".wav", as its player names it.
  const label = cover?.title || (one.kind === 'audio' && one.name ? soundTitle(one.name, null) : one.name) || one.title || 'Untitled'
  const items = mediaMenu(one, onOpen)
  return (
    <RowMenu items={items}>
      <button type="button" data-media={one.kind} data-src={one.src} data-note={`${one.type}:${one.id}`} data-pdf-peek={one.kind === 'pdf' ? one.src : undefined} data-pdf-peek-name={one.kind === 'pdf' ? one.name : undefined} onClick={onOpen} className={tileClass(false, false, false)}>
        <Face one={one} cover={one.kind === 'pdf' ? (cover === undefined ? undefined : cover?.image ?? '') : undefined} />
        <span className="flex min-w-0 flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
          <span className={`truncate text-sm font-medium ${one.private ? 'private-text' : ''}`}>{label}</span>
          <span className="truncate text-xs text-muted-foreground">{one.name || cover?.title ? `${WORD[one.kind]} in ${one.title || 'Untitled'}` : WORD[one.kind]}</span>
        </span>
      </button>
    </RowMenu>
  )
}

/** The tile's top: the picture made small, a PDF's first page, or a clean card for a file with none. */
function Face({ one, cover }: { one: Media; cover?: string }): React.JSX.Element {
  const [thumb, setSmall] = useState<string | null>(null)
  // A PDF's face is its cover, drawn by the reader's own renderer (Quick Look often draws none).
  const small = one.kind === 'pdf' ? cover ?? null : thumb
  const [moving, setMoving] = useState(false)
  const rest = useRef(0)
  useEffect(() => () => clearTimeout(rest.current), [])
  // Asked for only once the tile is drawn: a row of the grid out of sight never asks.
  useEffect(() => {
    if (one.kind === 'audio' || one.kind === 'pdf') return
    let live = true
    void smallPicture(one.src, true).then((made) => live && setSmall(made || ''))
    return () => void (live = false)
  }, [one.src, one.kind])
  const frame = `relative aspect-[4/3] w-full overflow-hidden bg-accent ${one.private ? 'private-text' : ''}`
  if (one.kind === 'audio') return <span className={frame}><AudioFace one={one} /></span>
  if (small)
    return (
      // A GIF stands still until rested on (the same grace as a book's cover), then moves: a page of them never runs at once, and a sweep across sets none off.
      // A PDF's cover turns into its pages in place when rested on and slid across (pdf-peek.tsx).
      <span className={frame} data-pdf-peek-scrub={one.kind === 'pdf' ? '' : undefined} onPointerEnter={() => one.kind === 'gif' && (clearTimeout(rest.current), (rest.current = window.setTimeout(() => setMoving(true), GRACE)))} onPointerLeave={() => (clearTimeout(rest.current), setMoving(false))}>
        <img src={moving ? one.src : small} alt="" draggable={false} decoding="async" className={`size-full ${one.kind === 'pdf' ? 'object-contain bg-white' : 'object-cover'} animate-in fade-in-0 duration-200`} />
        {one.kind !== 'picture' && <span className="absolute bottom-1.5 left-1.5 rounded bg-background px-1.5 py-px text-xs font-medium">{WORD[one.kind]}</span>}
      </span>
    )
  return (
    <span className={`${frame} flex flex-col items-center justify-center gap-1.5 px-3 text-muted-foreground`}>
      {small === '' && (
        <>
          <FileText className="size-7" />
          <span className="text-xs font-medium text-foreground">{WORD[one.kind]}</span>
        </>
      )}
    </span>
  )
}

/** A recording: plays where it sits, without opening its note, in the one sound player every recording wears. */
function AudioFace({ one }: { one: Media }): React.JSX.Element {
  return (
    // Played where it sits: a press anywhere on it is the player's, never the tile's (which opens the note).
    <span className="flex size-full items-center px-4" onClick={(event) => event.stopPropagation()}>
      <SoundPlayer src={one.src} className="w-full" />
    </span>
  )
}

/**
 * "Copy link": the picture or file itself, as copying it out of its note puts
 * it on the clipboard, so pasted into another note it shows there too. The
 * store keeps one copy of the file, which both notes point at.
 */
async function copyMedia(one: Media): Promise<void> {
  const quote = (text: string): string => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const picture = one.kind === 'picture' || one.kind === 'gif'
  const html = picture
    ? `<img src="${quote(one.src)}">`
    : `<a data-attachment="" data-name="${quote(one.name)}" data-size="${one.size}" href="${quote(one.src)}">${quote(one.name)}</a>`
  const text = picture ? `![](${one.src})` : `[${one.name}](${one.src})`
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
    chime('copy')
    toast(picture ? 'Copied: paste it into any note to show the picture there' : 'Copied: paste it into any note to show the file there')
  } catch {
    refuse('Could not copy it', 'error')
  }
}
