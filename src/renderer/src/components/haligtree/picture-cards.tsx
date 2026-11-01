import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { call, useLive } from '@/lib/haligtree'
import { still } from '@/lib/motion'
import { pictureIn } from '@/lib/answer-picture'
import { num } from '../../../../main/dates'
import { boxOf, coverOf, groupsOf, overlap, snapped, type Cover, type CoverKind, type Hide, type Label, type Occlusion } from '../../../../main/occlusion'
import { Kbd, refuse, toast } from './ui'
import { DeckPick, deckTagOf, deckTitle } from './decks'

/** Every cover in one solid colour of the theme: letters never show through. The asked one glows softly. */
const COVER = 'color-mix(in oklab, var(--foreground) 72%, var(--background))'
const ASKED = 'var(--primary)'

/** One cover drawn in the picture's own pixels (`w` by `h`). */
function Shape({ cover, w, h, fill, ...rest }: { cover: Cover; w: number; h: number; fill: string } & React.SVGProps<SVGElement>): React.JSX.Element {
  const props = { fill, ...rest } as React.SVGProps<SVGElement>
  if (cover.kind === 'oval') return <ellipse cx={(cover.x + cover.w / 2) * w} cy={(cover.y + cover.h / 2) * h} rx={(cover.w / 2) * w} ry={(cover.h / 2) * h} {...(props as React.SVGProps<SVGEllipseElement>)} />
  if (cover.kind === 'shape' && cover.points) return <polygon points={cover.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')} {...(props as React.SVGProps<SVGPolygonElement>)} />
  if (cover.kind === 'brush' && cover.points)
    return <polyline points={cover.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')} fill="none" stroke={fill} strokeWidth={(cover.size ?? 0.03) * w} strokeLinecap="round" strokeLinejoin="round" {...(rest as React.SVGProps<SVGPolylineElement>)} />
  return <rect x={cover.x * w} y={cover.y * h} width={cover.w * w} height={cover.h * h} rx={Math.min(w, h) * 0.004} {...(props as React.SVGProps<SVGRectElement>)} />
}

/** A picture's own size, once it has loaded: covers are drawn in its pixels. */
function useSize(src: string): { w: number; h: number } | null {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null)
  useEffect(() => {
    const image = new Image()
    image.onload = () => setSize({ src, w: image.naturalWidth || 1, h: image.naturalHeight || 1 })
    image.src = src
  }, [src])
  return size && size.src === src ? size : null
}

/**
 * A card made from a picture, in Review: the picture with its covers. Asked,
 * the covers of this card glow softly (and with "hide all" every other cover
 * stays on too); shown, they lift off. `all` lifts every cover, to look the
 * whole picture over.
 */
export function CoveredPicture({ occlusion, shown, all = false }: { occlusion: Occlusion; shown: boolean; all?: boolean }): React.JSX.Element {
  const size = useSize(occlusion.src)
  const flat = still()
  return (
    <div data-covered-picture className="relative mx-auto w-fit max-w-full">
      <img src={occlusion.src} alt="" draggable={false} className="block max-h-[min(60vh,36rem)] w-auto max-w-full rounded-[4px]" />
      {size && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <filter id="cover-glow" x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation={Math.max(size.w, size.h) * 0.006} floodColor="var(--primary)" floodOpacity="0.55" />
            </filter>
          </defs>
          {occlusion.covers.map((cover, index) => {
            const asked = cover.group === occlusion.ask
            // "One": only the asked covers are on; "all": every cover is, the asked ones in their own colour.
            if (!asked && occlusion.hide !== 'all') return null
            const off = all || (asked && shown)
            return (
              <motion.g key={index} data-cover={asked ? 'asked' : 'other'} data-cover-off={off || undefined}
                initial={false}
                animate={off ? { opacity: 0, y: flat ? 0 : -size.h * 0.012, scale: flat ? 1 : 1.03 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: flat ? 0.12 : 0.24, ease: [0.23, 1, 0.32, 1] }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                <Shape cover={cover} w={size.w} h={size.h} fill={asked ? ASKED : COVER} filter={asked ? 'url(#cover-glow)' : undefined} />
              </motion.g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

type Tool = CoverKind
const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'box', label: 'Box', key: 'B' },
  { id: 'oval', label: 'Oval', key: 'O' },
  { id: 'shape', label: 'Free shape', key: 'F' },
  { id: 'brush', label: 'Brush', key: 'R' }
]

/** A picture from a file, a paste or a drop, kept as the app keeps every picture. */
async function keep(file: File): Promise<string | null> {
  return window.api.saveImage(file.type, new Uint8Array(await file.arrayBuffer())).then((src) => src || null)
}

/**
 * "Make cards from a picture" (Anki's image occlusion): a picture from a book
 * snip, a note, a paste, a drop or a file; its labels found on this Mac
 * (Vision, no internet); one click covers them all, or draw boxes, ovals, a
 * free shape or a brush stroke, which snap to the labels. Covers grouped with
 * G are asked as one card. Each group becomes a card.
 */
export function PictureCards({ deck: aimed, onClose, onShow }: { deck?: string | null; onClose: () => void; /** After making them, "Show" lists just the new cards. */ onShow?: (ids: string[]) => void }): React.JSX.Element {
  const [picture, setPicture] = useState<{ src: string; from: { id: string } | null; title?: string } | null>(null)
  const [labels, setLabels] = useState<Label[] | 'finding' | { error: string } | null>(null)
  const [covers, setCovers] = useState<Cover[]>([])
  const [history, setHistory] = useState<Cover[][]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [tool, setTool] = useState<Tool>('box')
  const [hide, setHide] = useState<Hide>('one')
  const [deck, setDeck] = useState(aimed ?? '')
  const [drawing, setDrawing] = useState<Cover | null>(null)
  const sources = useLive(() => call<{ src: string; title: string; id: string | null }[]>('cards:picture:sources'), null as { src: string; title: string; id: string | null }[] | null)
  const size = useSize(picture?.src ?? '')
  const board = useRef<SVGSVGElement>(null)
  const found = Array.isArray(labels) ? labels : []

  const change = (next: Cover[]): void => (setHistory((was) => [...was, covers]), setCovers(next))
  const choose = (src: string, from: { id: string } | null = null, title?: string): void => {
    chime('open')
    setPicture({ src, from, title })
    setCovers([])
    setHistory([])
    setPicked(new Set())
    setLabels('finding')
    void window.api.haligtree<{ labels: Label[] } | { error: { message: string } }>('labels', src).then((got) =>
      setLabels('labels' in got ? got.labels : { error: got.error.message }))
  }
  const fromFile = (file: File | null): void => {
    if (!file) return
    void keep(file).then((src) => (src ? choose(src) : refuse('That kind of picture cannot be kept: try a PNG or JPEG')))
  }
  // ⌘V anywhere on the page: a pasted picture, in place of the one there.
  useEffect(() => {
    const paste = (event: ClipboardEvent): void => {
      const file = pictureIn(event.clipboardData)
      if (!file || (event.target as HTMLElement | null)?.closest?.('input, textarea')) return
      event.preventDefault()
      fromFile(file)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  })

  const groups = groupsOf(covers)
  // Cards numbered 1, 2, 3 in reading order (by rows, then left to right): as the covers show it and as the cards are made.
  const order = groups.map((one) => ({ one, at: covers.filter((cover) => cover.group === one).reduce((top, cover) => Math.min(top, Math.round(cover.y * 20) * 10 + cover.x), Infinity) })).sort((a, b) => a.at - b.at)
  const renumber = new Map(order.map(({ one }, at) => [one, at + 1]))
  const nextGroup = (): number => (groups.length ? Math.max(...groups) + 1 : 1)
  const coverAll = (): void => {
    const fresh = found.filter((label) => !covers.some((one) => overlap(label, one) > 0.5))
    if (!fresh.length) return refuse(found.length ? 'Every label is covered already' : 'No labels were found: draw a cover over each part to ask')
    chime('gather')
    const first = nextGroup()
    change([...covers, ...fresh.map((label, at) => coverOf(label, first + at))])
  }
  const remove = (): void => {
    if (!picked.size) return
    chime('tuck')
    change(covers.filter((_, at) => !picked.has(at)))
    setPicked(new Set())
  }
  const group = (apart: boolean): void => {
    if (apart ? !picked.size : picked.size < 2) return refuse(apart ? 'Pick a grouped cover first' : 'Pick two or more covers with ⇧ held, then G asks them as one card')
    chime(apart ? 'separate' : 'gather')
    let fresh = nextGroup()
    const to = Math.min(...[...picked].map((at) => covers[at].group))
    change(covers.map((one, at) => (picked.has(at) ? { ...one, group: apart ? fresh++ : to } : one)))
  }
  const undo = (): void => {
    const last = history.at(-1)
    if (!last) return
    chime('undo')
    setHistory(history.slice(0, -1))
    setCovers(last)
    setPicked(new Set())
  }
  const make = (): void => {
    if (!picture || !covers.length) return refuse('Cover at least one label first')
    const tag = deckTagOf(deck)
    void call<string[]>('cards:picture', { src: picture.src, covers: covers.map((one) => ({ ...one, group: renumber.get(one.group)! })), hide, deck: tag, from: picture.from }).then((ids) => {
      chime('added')
      onClose()
      toast(`${num(ids.length)} ${ids.length === 1 ? 'card' : 'cards'} made from the picture${tag ? ` in the deck ${deckTitle(tag)}` : ''}`, () => void call('cards:list:undo', ids).then(() => chime('undo')), 'success', onShow ? { label: 'Show them', key: 'S', run: () => onShow(ids) } : undefined)
    })
  }
  const keys = (event: React.KeyboardEvent): void => {
    if ((event.target as HTMLElement).closest('input, textarea')) return
    const key = event.key.toLowerCase()
    if (event.metaKey && key === 'z') return void (event.preventDefault(), undo())
    if (event.metaKey && event.key === 'Enter') return void (event.preventDefault(), make())
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') return void (event.preventDefault(), picked.size ? setPicked(new Set()) : onClose())
    if (event.key === 'Backspace' || event.key === 'Delete') return void (event.preventDefault(), remove())
    const tool = TOOLS.find((one) => one.key.toLowerCase() === key)
    if (tool) return void (chime('tap'), setTool(tool.id))
    if (key === 'g') return void group(event.shiftKey)
    if (key === 'a' && picture) return void coverAll()
  }

  // Drawing: where the pointer is, as a share of the picture.
  const at = (event: React.PointerEvent): [number, number] => {
    const box = board.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))]
  }
  const start = useRef<[number, number] | null>(null)
  const down = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return
    const hit = (event.target as SVGElement).closest('[data-made-cover]')
    if (hit) {
      // A cover clicked is picked; with ⇧ it joins the ones picked.
      const index = Number(hit.getAttribute('data-made-cover'))
      chime('tap')
      setPicked(event.shiftKey ? new Set(picked.has(index) ? [...picked].filter((one) => one !== index) : [...picked, index]) : new Set([index]))
      return
    }
    const label = (event.target as SVGElement).closest('[data-found-label]')
    if (label) {
      chime('pop')
      change([...covers, coverOf(found[Number(label.getAttribute('data-found-label'))], nextGroup())])
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPicked(new Set())
    const point = at(event)
    start.current = point
    setDrawing(tool === 'shape' || tool === 'brush'
      ? { kind: tool, x: point[0], y: point[1], w: 0, h: 0, points: [point], size: tool === 'brush' ? 0.03 : undefined, group: nextGroup() }
      : { kind: tool, x: point[0], y: point[1], w: 0, h: 0, group: nextGroup() })
  }
  const move = (event: React.PointerEvent): void => {
    if (!drawing || !start.current) return
    const point = at(event)
    if (drawing.points) {
      const last = drawing.points.at(-1)!
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.004) return
      const points = [...drawing.points, point]
      return setDrawing({ ...drawing, ...boxOf(points), points })
    }
    const [x0, y0] = start.current
    setDrawing({ ...drawing, x: Math.min(x0, point[0]), y: Math.min(y0, point[1]), w: Math.abs(point[0] - x0), h: Math.abs(point[1] - y0) })
  }
  const up = (): void => {
    const done = drawing
    setDrawing(null)
    start.current = null
    if (!done) return
    // Too small to be meant: a click, not a cover.
    if (done.points ? done.points.length < 3 : done.w < 0.01 || done.h < 0.01) return
    chime('pop')
    change([...covers, snapped(done, found)])
  }

  const status = labels === 'finding' ? 'Finding the labels on this Mac…'
    : labels && !Array.isArray(labels) ? labels.error
    : found.length ? `${num(found.length)} ${found.length === 1 ? 'label' : 'labels'} found on this Mac, without the internet. Click one to cover it.`
    : picture ? 'No labels found on it: draw a cover over each part to ask.' : ''

  return (
    <section data-picture-cards onKeyDown={keys} tabIndex={-1} className="flex flex-col gap-3 rounded-[5px] border bg-accent/30 px-5 pt-4 pb-3 outline-none">
      <p className="text-sm text-foreground/80">
        <b className="font-semibold text-foreground">Cards from a picture.</b> Cover the labels of a diagram; each cover, or each group of covers, is a card that asks what it hides.
      </p>
      {!picture ? (
        <div
          data-picture-drop
          onDragOver={(event) => [...event.dataTransfer.items].some((one) => one.type.startsWith('image/')) && event.preventDefault()}
          onDrop={(event) => {
            const file = pictureIn(event.dataTransfer)
            if (!file) return
            event.preventDefault()
            fromFile(file)
          }}
          className="grid gap-3 rounded-[4px] border border-dashed border-foreground/20 bg-background px-4 py-4">
          <span className="flex flex-wrap items-center gap-2 text-sm text-foreground/80">
            <span>Paste a picture with <Kbd>⌘V</Kbd>, drop one here, or</span>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" data-picture-file className="sr-only" onChange={(event) => fromFile(event.target.files?.[0] ?? null)} />
              <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-control font-medium text-foreground transition-colors hover:bg-accent">Choose a picture…</span>
            </label>
          </span>
          {/* Snips from a book (they keep its title and page) and pictures already in notes. */}
          {!!sources?.length && (
            <span className="grid gap-2">
              <span className="text-xs text-muted-foreground">Or one you already have: snips from your books, then pictures in your notes</span>
              <span data-picture-sources className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 overflow-y-auto">
                {sources.map((one) => (
                  <button key={one.src} type="button" data-picture-source onClick={() => choose(one.src, one.id ? { id: one.id } : null, one.title)}
                    className="grid cursor-pointer content-start gap-1 rounded-[4px] border border-foreground/10 p-1.5 text-left transition-colors hover:bg-accent/60">
                    <img src={one.src} alt="" loading="lazy" className="aspect-square w-full rounded-[3px] bg-accent/40 object-cover" />
                    <span className="truncate text-xs text-foreground/80">{one.title}</span>
                  </button>
                ))}
              </span>
            </span>
          )}
        </div>
      ) : (
        <>
          {/* The tools, the way it asks, and the one-click cover, all on one line that stays put. */}
          <div data-picture-tools className="flex flex-wrap items-center gap-2">
            <span role="radiogroup" aria-label="Draw with" className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control max-sm:h-9">
              {TOOLS.map((one) => (
                <button key={one.id} type="button" role="radio" aria-checked={tool === one.id} data-picture-tool={one.id} onClick={() => (chime('tap'), setTool(one.id))}
                  className={`h-7 cursor-pointer rounded-md border px-2.5 transition-colors max-sm:h-8 ${tool === one.id ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{one.label}</button>
              ))}
            </span>
            <Button variant="outline" size="sm" className="h-8 cursor-pointer px-3" data-picture-cover-all disabled={!Array.isArray(labels) || !found.length} onClick={coverAll}>
              Cover every label{found.length ? <span className="font-normal text-muted-foreground tabular-nums">{num(found.length)}</span> : null}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 cursor-pointer px-3" data-picture-group disabled={picked.size < 2} onClick={() => group(false)}>Ask as one card</Button>
            <span className="flex-1" />
            <span role="radiogroup" aria-label="When asked" className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control max-sm:h-9">
              {(['one', 'all'] as const).map((one) => (
                <button key={one} type="button" role="radio" aria-checked={hide === one} data-picture-hide={one} onClick={() => (chime('tap'), setHide(one))}
                  className={`h-7 cursor-pointer rounded-md border px-2.5 transition-colors max-sm:h-8 ${hide === one ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{one === 'one' ? 'Hide one' : 'Hide all'}</button>
              ))}
            </span>
          </div>
          <p data-picture-status className="min-h-5 text-sm text-muted-foreground">{status}</p>
          {/* What the choice on the right does, in words, in the same place whichever is picked. */}
          <p data-picture-hide-said className="-mt-2 min-h-5 text-sm text-foreground/80">
            {hide === 'one' ? 'Hide one: each card covers only the label it asks; the others show.' : 'Hide all: every label stays covered; the one asked glows.'}
          </p>
          <div className="relative mx-auto w-fit max-w-full select-none">
            <img src={picture.src} alt="" draggable={false} className="block max-h-[min(60vh,36rem)] w-auto max-w-full rounded-[4px]" />
            {size && (
              <svg ref={board} data-picture-board viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 size-full cursor-crosshair touch-none overflow-visible"
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (setDrawing(null), (start.current = null))}>
                {/* Labels found and not yet covered: a faint outline, clicked to cover. */}
                {found.map((label, index) => !covers.some((one) => overlap(label, one) > 0.5) && (
                  <rect key={`l${index}`} data-found-label={index} x={label.x * size.w} y={label.y * size.h} width={label.w * size.w} height={label.h * size.h}
                    fill="transparent" stroke="var(--primary)" strokeOpacity={0.55} strokeDasharray={`${size.w * 0.006} ${size.w * 0.004}`} strokeWidth={size.w * 0.0018} className="cursor-pointer" />
                ))}
                {covers.map((cover, index) => (
                  <g key={index} data-made-cover={index} data-picked={picked.has(index) || undefined} className="cursor-pointer">
                    <Shape cover={cover} w={size.w} h={size.h} fill={COVER} stroke={picked.has(index) ? 'var(--primary)' : undefined} strokeWidth={picked.has(index) ? size.w * 0.004 : undefined} />
                    {/* Which card it is, so grouped covers read as one. */}
                    <text x={(cover.x + cover.w / 2) * size.w} y={(cover.y + cover.h / 2) * size.h} textAnchor="middle" dominantBaseline="central" fill="var(--background)"
                      fontSize={Math.min(cover.h * size.h * 0.6, size.w * 0.022)} fontWeight={600} className="pointer-events-none tabular-nums">{renumber.get(cover.group)}</text>
                  </g>
                ))}
                {drawing && <Shape cover={drawing} w={size.w} h={size.h} fill={COVER} opacity={0.7} />}
              </svg>
            )}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" className="h-8 min-w-[8.5rem] cursor-pointer tabular-nums" data-picture-make disabled={!covers.length} onClick={make}>
          {covers.length ? `Make ${num(groups.length)} ${groups.length === 1 ? 'card' : 'cards'}` : 'Make the cards'}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 cursor-pointer text-muted-foreground" onClick={onClose}>Cancel</Button>
        {picture && <Button variant="ghost" size="sm" className="h-8 cursor-pointer text-muted-foreground" data-picture-other onClick={() => {
          // Its covers are not lost: Undo puts the picture back as it was.
          const was = { picture, labels, covers, history }
          chime('fold')
          setPicture(null)
          setLabels(null)
          setCovers([])
          setHistory([])
          setPicked(new Set())
          if (was.covers.length) toast('The picture and its covers are put aside', () => (chime('undo'), setPicture(was.picture), setLabels(was.labels), setCovers(was.covers), setHistory(was.history)))
        }}>Another picture</Button>}
        <DeckPick value={deck} onChange={setDeck} />
        <span className="ml-auto text-sm text-muted-foreground max-sm:hidden">
          {picture ? <><Kbd>A</Kbd> covers every label, <Kbd>G</Kbd> groups, <Kbd>⌫</Kbd> removes, <Kbd>⌘Z</Kbd> undoes</> : <><Kbd>Esc</Kbd> closes</>}
        </span>
      </div>
    </section>
  )
}
