import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Image as ImageIcon, ImagePlay, Pause } from 'lucide-react'
import { FileText, Play } from '@/components/ui/icons'
import { call, unloaded, useLive } from '@/lib/haligtree'
import { smallPicture } from '@/lib/notes'
import { headingIn } from '@/lib/capture-links'
import { usePdfCover } from '@/components/pdf/pdf-cover'
import { canSplit, openAside } from '@/lib/split'
import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { Empty, Page, refuse, toast, VirtualList } from './ui'
import { Chip } from './display'
import { ListSearch, tileClass } from './note-list'
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

/**
 * Every picture, screenshot, GIF, PDF and recording kept in the book's notes,
 * as a grid, newest note first. Pointed at, a tile says the note it is in;
 * clicked, that note opens on it (⌥-click: to the side).
 */
export function MediaView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const all = useLive(readMedia, [] as Media[])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | MediaKind>('all')
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return all.filter((one) => (kind === 'all' || one.kind === kind) &&
      words.every((word) => `${one.title} ${one.name} ${one.near}`.toLowerCase().includes(word)))
  }, [all, query, kind])

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
  }, [all.length > 0])
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

  return (
    <Page title="Media" waiting={unloaded(all)} count={unloaded(all) || !all.length ? undefined : shown.length} unit={['file', 'files']}
      search={all.length > 0 && <ListSearch value={query} placeholder="Find by note, name or words" onChange={setQuery} onDone={() => shown[0] && open(shown[0])} />}>
      {all.length ? (
        <div ref={box} data-media-grid className="mx-5 mb-4">
          {/* The kinds, as Gems' are: one on at a time, pressed again to show every kind. */}
          <div data-media-kinds className="flex flex-wrap gap-1 pt-4 pb-3 text-xs">
            {KINDS.map((one) => (
              <Chip key={one.id} on={kind === one.id} onClick={() => (chime(kind === one.id ? 'off' : 'on'), setKind(kind === one.id ? 'all' : one.id))} mark={<one.icon className="size-3.5" />}>{one.label}</Chip>
            ))}
          </div>
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

function Tile({ one, onOpen }: { one: Media; onOpen: () => void }): React.JSX.Element {
  const picture = one.kind === 'picture' || one.kind === 'gif'
  // A PDF is named by the title it carries, as the reader names it, and shows its first page.
  const cover = usePdfCover(one.kind === 'pdf' ? one.src : null, one.name)
  const label = cover?.title || one.name || one.title || 'Untitled'
  const items: RowItem[] = [
    { label: 'Open note', keys: '↵', run: onOpen },
    canSplit() && { label: 'Open to the side', keys: '⌥-click', run: () => (openAside(one.type, one.id), headingIn(one.type, one.id, one.src)) },
    'separator',
    { label: 'Copy link', hint: 'Paste it into any note to show it there too', run: () => void copyMedia(one) },
    picture && { label: 'Copy image', run: () => void window.api.copyImage(one.src).then((done) => (done ? (chime('copy'), toast('Copied the picture')) : refuse('Could not copy it', 'error'))) },
    { label: 'Show in Finder', run: () => void window.api.showFile(one.src) }
  ]
  return (
    <RowMenu items={items}>
      <button type="button" data-media={one.kind} data-src={one.src} data-note={`${one.type}:${one.id}`} onClick={onOpen} className={tileClass(false, false, false)}>
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
      // A GIF stands still until pointed at, then moves: a page of them never runs at once.
      <span className={frame} onPointerEnter={() => one.kind === 'gif' && setMoving(true)} onPointerLeave={() => setMoving(false)}>
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

/** The six bars of the waveform mark (lucide's AudioLines): where each stands across, and its height at rest. */
const BARS = [[2, 3], [6, 11], [10, 18], [14, 7], [18, 13], [22, 3]] as const
/** One Web Audio graph per recording element: an element can be wired into one only once. */
const heard = new WeakMap<HTMLAudioElement, AnalyserNode>()
let ears: AudioContext | null = null

/**
 * The waveform mark, moving with what is playing: each bar's height follows the loudness of its own band of the
 * sound, read every frame from an analyser, so speech and music move it differently. Still at its drawn heights when
 * paused or with Motion off. Written straight onto the bars each frame, so nothing re-renders as it moves.
 */
function LiveBars({ sound, playing }: { sound: React.RefObject<HTMLAudioElement | null>; playing: boolean }): React.JSX.Element {
  const bars = useRef<(SVGLineElement | null)[]>([])
  useEffect(() => {
    const audio = sound.current
    const rest = (): void => bars.current.forEach((bar) => bar?.removeAttribute('transform'))
    if (!playing || !audio || still()) return rest()
    ears ??= new AudioContext()
    void ears.resume()
    let analyser = heard.get(audio)
    if (!analyser) {
      analyser = ears.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      ears.createMediaElementSource(audio).connect(analyser).connect(ears.destination)
      heard.set(audio, analyser)
    }
    const levels = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0
    const draw = (): void => {
      analyser.getByteFrequencyData(levels)
      BARS.forEach(([, tall], at) => {
        // Each bar its own slice of the low and middle bands, where voices and most music are.
        const level = levels[1 + at * 3] / 255
        // From a short stub to the full height of the mark, about its middle.
        const scale = Math.max(2, level * 18) / tall
        bars.current[at]?.setAttribute('transform', `translate(0 ${12 * (1 - scale)}) scale(1 ${scale})`)
      })
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => (cancelAnimationFrame(frame), rest())
  }, [playing, sound])
  return (
    <svg data-media-wave aria-hidden viewBox="0 0 24 24" className="size-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      {BARS.map(([x, tall], at) => (
        <line key={x} ref={(bar) => void (bars.current[at] = bar)} x1={x} x2={x} y1={12 - tall / 2} y2={12 + tall / 2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/** A recording: plays where it sits, without opening its note. */
function AudioFace({ one }: { one: Media }): React.JSX.Element {
  const sound = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const flip = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const audio = sound.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <LiveBars sound={sound} playing={playing} />
      <span role="button" tabIndex={0} aria-label={playing ? 'Pause' : 'Play'} data-media-play onClick={flip}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), event.stopPropagation(), flip(event as unknown as React.MouseEvent))}
        className="flex h-7 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent">
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {playing ? 'Pause' : 'Play'}
      </span>
      <audio ref={sound} src={one.src} crossOrigin="anonymous" preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
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
