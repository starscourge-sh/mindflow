import { small } from '@/lib/small-picture'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { chime } from '@/lib/sound'
import { call, useLive } from '@/lib/haligtree'
import { glideWay, still } from '@/lib/motion'
import { pictureIn } from '@/lib/answer-picture'
import { num, plural } from '../../../../main/dates'
import { boxOf, coverOf, extent, groupsOf, inside, moved, overlap, resized, seen, snapped, stacked, type Cover, type CoverKind, type Hide, type Label, type Occlusion } from '../../../../main/occlusion'
import { Decoded, FIRST_PICTURES, Kbd, refuse, Tip, toast } from './ui'
import { ReadsIn } from '@/lib/reads-in'
import { Orb } from './orb'
import { deckTagOf, deckTitle } from './decks'
import { CARD_FIELD, CardForm, CardFormFoot, tagsIn } from './card-form'
import { ChevronLeft, ChevronRight, Circle, Group, ImagePlus, Lasso, Brush, Minus, MousePointer2, Plus, Redo2, ScanText, Square, Undo2, Ungroup } from 'lucide-react'

/** Every cover in the theme's ink, solid: letters never show through. Pointed at, a shade lighter. The asked one, in study and in the preview, glows in the accent. */
const INK = 'color-mix(in oklab, var(--foreground) 88%, var(--background))'
const INK_HOVER = 'color-mix(in oklab, var(--foreground) 74%, var(--background))'
const ASKED = 'var(--primary)'
/** A cover's corners, in points on screen, whatever the picture's own size. */
const ROUND = 6

/** One cover drawn in the picture's own pixels (`w` by `h`); `round` is its corners in those pixels. */
function Shape({ cover, w, h, fill, round = Math.min(w, h) * 0.012, ...rest }: { cover: Cover; w: number; h: number; fill: string; round?: number } & React.SVGProps<SVGElement>): React.JSX.Element {
  const props = { fill, ...rest } as React.SVGProps<SVGElement>
  if (cover.kind === 'oval') return <ellipse cx={(cover.x + cover.w / 2) * w} cy={(cover.y + cover.h / 2) * h} rx={(cover.w / 2) * w} ry={(cover.h / 2) * h} {...(props as React.SVGProps<SVGEllipseElement>)} />
  if (cover.kind === 'shape' && cover.points) return <polygon points={cover.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')} strokeLinejoin="round" {...(props as React.SVGProps<SVGPolygonElement>)} />
  if (cover.kind === 'brush' && cover.points)
    return <polyline points={cover.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round" {...(rest as React.SVGProps<SVGPolylineElement>)} stroke={fill} strokeWidth={(cover.size ?? 0.03) * w} />
  return <rect x={cover.x * w} y={cover.y * h} width={cover.w * w} height={cover.h * h} rx={round} {...(props as React.SVGProps<SVGRectElement>)} />
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
 * A card made from a picture, in Review and in the maker's preview: the
 * picture with its covers. Asked, the covers of this card glow (and with
 * "hide all" every other cover stays on too); shown, they lift off. `all`
 * lifts every cover, to look the whole picture over.
 */
export function CoveredPicture({ occlusion, shown, all = false, fit = 'max-h-[min(60vh,36rem)]' }: { occlusion: Occlusion; shown: boolean; all?: boolean; /** The picture's height: the maker's preview is a small one. */ fit?: string }): React.JSX.Element {
  const size = useSize(occlusion.src)
  const flat = still()
  const glow = `cover-glow-${useId().replace(/:/g, '')}`
  return (
    <div data-covered-picture className="relative mx-auto w-fit max-w-full">
      <img src={occlusion.src} alt="" draggable={false} className={`block w-auto max-w-full rounded-[4px] ${fit}`} />
      {size && (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} className="pointer-events-none absolute inset-0 size-full overflow-hidden rounded-[4px]" aria-hidden>
          <defs>
            <filter id={glow} x="-20%" y="-40%" width="140%" height="180%">
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
                <Shape cover={cover} w={size.w} h={size.h} fill={asked ? ASKED : INK} filter={asked ? `url(#${glow})` : undefined} />
              </motion.g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

type Tool = 'select' | CoverKind
const TOOLS: { id: Tool; label: string; tip: string; key: string; icon: typeof Square }[] = [
  { id: 'select', label: 'Pick', tip: 'Pick and move: drag across covers or labels to pick them', key: 'V', icon: MousePointer2 },
  { id: 'box', label: 'Box', tip: 'Box: drag to cover a part', key: 'B', icon: Square },
  { id: 'oval', label: 'Oval', tip: 'Oval: drag to cover a part', key: 'O', icon: Circle },
  { id: 'shape', label: 'Free shape', tip: 'Free shape: draw round a part', key: 'F', icon: Lasso },
  { id: 'brush', label: 'Brush', tip: 'Brush: paint over a part', key: 'R', icon: Brush }
]
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3, 4]

/** A picture from a file, a paste or a drop, kept as the app keeps every picture. */
async function keep(file: File): Promise<string | null> {
  return window.api.saveImage(file.type, new Uint8Array(await file.arrayBuffer())).then((src) => src || null)
}

/**
 * The picture being covered when the maker closed without making cards (Esc, Cancel, another tab): it opens with it
 * again, as Mail keeps a draft, so no cover is lost by a key pressed once too often. Making the cards ends it.
 */
type Draft = { picture: { src: string; from: { id: string } | null; title?: string }; labels: Label[] | { error: string } | null; doc: Doc; question: string; hide: Hide }
let draft: Draft | null = null

/** What can be undone: the covers, and the found labels set aside as not to be asked. */
type Doc = { covers: Cover[]; gone: number[] }
const EMPTY: Doc = { covers: [], gone: [] }
type Box = { x: number; y: number; w: number; h: number }
const touches = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** What a press and drag on the picture is doing, from the press to the letting go. */
type Gesture =
  | { kind: 'draw'; start: [number, number]; label: number | null }
  | { kind: 'marquee'; start: [number, number]; add: boolean; label: number | null; covers: Set<number>; labels: Set<number> }
  | { kind: 'move'; start: [number, number]; was: Doc; far: boolean; index: number; alone: boolean }
  | { kind: 'resize'; corner: number; was: Doc; index: number }

/**
 * "Cards from a picture" (Anki's image occlusion): a picture from a book snip,
 * a note, a paste, a drop or a file; its labels found on this Mac (Vision, no
 * internet); one click covers them all, or draw boxes, ovals, a free shape or
 * a brush stroke, which snap to the labels. Covers are picked, moved, resized,
 * nudged and removed as in any drawing app, each can carry its answer in
 * words, and a live preview shows each card as it will be asked.
 */
export function PictureCards({ deck: aimed, onClose, onShow }: { deck?: string | null; onClose: () => void; /** After making them, "Show" lists just the new cards. */ onShow?: (ids: string[]) => void }): React.JSX.Element {
  const [kept] = useState(() => draft)
  const [picture, setPicture] = useState<{ src: string; from: { id: string } | null; title?: string } | null>(kept?.picture ?? null)
  const [labels, setLabels] = useState<Label[] | 'finding' | { error: string } | null>(kept?.labels ?? null)
  const [doc, setDoc] = useState<Doc>(kept?.doc ?? EMPTY)
  const [past, setPast] = useState<Doc[]>([])
  const [future, setFuture] = useState<Doc[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [pickedLabels, setPickedLabels] = useState<Set<number>>(new Set())
  const [tool, setTool] = useState<Tool>('box')
  const [hide, setHide] = useState<Hide>(kept?.hide ?? 'one')
  const [question, setQuestion] = useState(kept?.question ?? '')
  const [deck, setDeck] = useState(aimed ?? '')
  const [tags, setTags] = useState('')
  const [drawing, setDrawing] = useState<Cover | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [seeing, setSeeing] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const sources = useLive(() => call<{ src: string; title: string; id: string | null }[]>('cards:picture:sources'), null as { src: string; title: string; id: string | null }[] | null)
  const size = useSize(picture?.src ?? '')
  const board = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const room = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const ids = useRef(1)
  // The picture whose labels are being looked for: an answer for one chosen before it is dropped.
  const asking = useRef('')
  const { covers, gone } = doc
  // Kept as it closes, whichever way it closes; made into cards, nothing is kept.
  const made = useRef(false)
  const now = useRef<Draft | null>(null)
  useLayoutEffect(() => void (now.current = picture && doc.covers.length ? { picture, labels: labels === 'finding' ? null : labels, doc, question, hide } : null))
  useEffect(() => {
    draft = null
    ids.current = Math.max(1, ...(kept?.doc.covers.map((one) => (one.id ?? 0) + 1) ?? []))
    return () => {
      draft = made.current ? null : now.current
      // Said once it has really closed: a remount at once (React's dev check) takes the draft back before this runs.
      queueMicrotask(() => draft && toast(`Your ${plural(draft.doc.covers.length, 'cover')} on the picture ${draft.doc.covers.length === 1 ? 'is' : 'are'} kept: “From a picture” opens ${draft.doc.covers.length === 1 ? 'it' : 'them'} again`, undefined, 'success'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const found = Array.isArray(labels) ? labels : []
  // Labels still to cover: not covered and not set aside.
  const open = found.map((label, index) => ({ label, index })).filter(({ label, index }) => !gone.includes(index) && !covers.some((one) => overlap(label, one) > 0.5))

  // The room the picture has: the form's width, and at most most of the window's height. It fills it, no bars round it.
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = room.current
    if (!node) return
    const watch = new ResizeObserver(() => setWidth(node.clientWidth))
    watch.observe(node)
    setWidth(node.clientWidth)
    return () => watch.disconnect()
  }, [picture])
  // A picture chosen: the keys are the maker's at once (B, O, V, ⌘Z), and the picture is brought into view.
  useEffect(() => {
    if (!picture) return
    const form = room.current?.closest('[data-card-form]') as HTMLElement | null
    if (form && !form.contains(document.activeElement)) form.focus({ preventScroll: true })
    room.current?.scrollIntoView({ block: 'nearest', behavior: glideWay() })
  }, [picture?.src]) // eslint-disable-line react-hooks/exhaustive-deps
  const tall = Math.min(typeof window === 'undefined' ? 600 : window.innerHeight * 0.55, 560)
  const fit = size && width ? Math.min(width / size.w, tall / size.h) : 0
  const view = { w: size ? size.w * fit : 0, h: size ? size.h * fit : 0 }
  // Points on screen for one share of the picture, as drawn now.
  const across = view.w * zoom
  const down_ = view.h * zoom
  const aspect = size ? size.w / size.h : 1
  const round = size && across ? (ROUND * size.w) / across : 0

  const withId = (cover: Cover): Cover => ({ ...cover, id: ids.current++ })
  const change = (next: Doc): void => {
    setPast((was) => [...was, doc])
    setFuture([])
    setDoc(next)
  }
  const putCovers = (next: Cover[]): void => change({ ...doc, covers: next })

  const choose = (src: string, from: { id: string } | null = null, title?: string): void => {
    const was = { picture, labels, doc, past }
    chime('open')
    setPicture({ src, from, title })
    setDoc(EMPTY)
    setPast([])
    setFuture([])
    setPicked(new Set())
    setPickedLabels(new Set())
    setEditing(null)
    setZoom(1)
    setSeeing(0)
    setLabels('finding')
    asking.current = src
    void window.api.haligtree<{ labels: Label[] } | { error: { message: string } }>('labels', src).then((got) => {
      // Another picture was chosen while this one was read: its labels are not this one's.
      if (asking.current !== src) return
      setLabels('labels' in got ? got.labels : { error: got.error.message })
    })
    // A picture chosen over one with covers: the covers are not lost.
    if (was.doc.covers.length) toast('The last picture and its covers are put aside', () => restore(was), 'success')
  }
  const restore = (was: { picture: typeof picture; labels: typeof labels; doc: Doc; past: Doc[] }): void => {
    chime('undo')
    asking.current = was.picture?.src ?? ''
    setPicture(was.picture)
    setLabels(was.labels)
    setDoc(was.doc)
    setPast(was.past)
    setFuture([])
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
  // Cards numbered 1, 2, 3 in the order they were drawn, so a number never changes under you as you draw the next one
  // (by rows, a cover drawn higher up took 1 from the one you drew first).
  const order = [...groups].sort((a, b) => a - b).map((one) => ({ one }))
  const renumber = new Map(order.map(({ one }, at) => [one, at + 1]))
  const cards = order.map(({ one }) => one)
  const nextGroup = (): number => (groups.length ? Math.max(...groups) + 1 : 1)
  const shown = Math.min(seeing, Math.max(0, cards.length - 1))
  const pick = (next: Set<number>, labelsToo: Set<number> = new Set()): void => {
    setPicked(next)
    setPickedLabels(labelsToo)
    // The preview follows: the card of the cover picked.
    if (next.size === 1) setSeeing(Math.max(0, cards.indexOf(covers[[...next][0]]?.group)))
  }

  const coverAll = (): void => {
    if (!open.length) return refuse(found.length ? 'Every label is covered already' : 'No labels were found on this picture: draw a cover over each part to ask')
    chime('gather')
    const first = nextGroup()
    putCovers([...covers, ...open.map(({ label }, at) => withId(coverOf(label, first + at)))])
    pick(new Set())
  }
  const remove = (): void => {
    if (!picked.size && !pickedLabels.size) return
    chime('tuck')
    change({ covers: covers.filter((_, at) => !picked.has(at)), gone: [...gone, ...pickedLabels] })
    pick(new Set())
  }
  // The picked covers, all in one group, with more than one cover in it: G's other way is to ask them apart.
  const pickedGroup = picked.size ? [...new Set([...picked].map((at) => covers[at]?.group))] : []
  const together = pickedGroup.length === 1 && covers.filter((one) => one.group === pickedGroup[0]).length > 1
  const group = (apart: boolean): void => {
    if (apart ? !together : picked.size < 2) return refuse(apart ? 'Pick covers asked together first' : 'Pick two or more covers (⇧-click, or drag across them with Pick), then ask them together')
    chime(apart ? 'separate' : 'gather')
    let fresh = nextGroup()
    const to = Math.min(...[...picked].map((at) => covers[at].group))
    putCovers(covers.map((one, at) => (picked.has(at) ? { ...one, group: apart ? fresh++ : to } : one)))
  }
  const undo = (): void => {
    const last = past.at(-1)
    if (!last) return
    chime('undo')
    setPast(past.slice(0, -1))
    setFuture([doc, ...future])
    setDoc(last)
    pick(new Set())
    setEditing(null)
  }
  const redo = (): void => {
    const next = future[0]
    if (!next) return
    chime('redo')
    setFuture(future.slice(1))
    setPast([...past, doc])
    setDoc(next)
    pick(new Set())
  }
  const pickAll = (): void => {
    if (!covers.length) return
    chime('select')
    pick(new Set(covers.map((_, at) => at)))
  }
  // Nudged a point on screen (⇧: ten), never past the picture's edge.
  const nudge = (dx: number, dy: number, held: boolean): void => {
    if (!across) return
    if (!held) chime('nudge')
    putCovers(covers.map((one, at) => (picked.has(at) ? inside(moved(one, dx / across, dy / down_), aspect) : one)))
  }
  const zoomTo = (next: number, anchor?: { x: number; y: number }): void => {
    const to = Math.min(4, Math.max(1, next))
    if (to === zoom) return
    const box = stage.current?.getBoundingClientRect()
    const at = anchor && box ? { x: anchor.x - box.left, y: anchor.y - box.top } : { x: view.w / 2, y: view.h / 2 }
    const node = stage.current
    // The point under the pointer (or the middle) stays where it is as the picture grows.
    if (node) pending.current = { fx: (node.scrollLeft + at.x) / across, fy: (node.scrollTop + at.y) / down_, ...at }
    chime(to > zoom ? 'zoomin' : 'zoomout')
    setZoom(to)
  }
  const step = (way: 1 | -1): void => zoomTo(way > 0 ? (ZOOMS.find((one) => one > zoom + 0.01) ?? 4) : ([...ZOOMS].reverse().find((one) => one < zoom - 0.01) ?? 1))
  const pending = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const node = stage.current
    const at = pending.current
    if (!node || !at) return
    pending.current = null
    node.scrollLeft = at.fx * across - at.x
    node.scrollTop = at.fy * down_ - at.y
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  // A pinch on the trackpad zooms the picture, not the page.
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const wheel = (event: WheelEvent): void => {
      // Zoomed in, two fingers move round the picture and only the picture: the page under it keeps still, at its
      // edges too (data-lenis-prevent and overscroll-contain on the stage keep the page's smooth scroll out of it).
      if (!event.ctrlKey) return
      event.preventDefault()
      zoomTo(zoom * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY })
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  })

  const edit = (index: number): void => {
    if (!covers[index]) return
    chime('tap')
    pick(new Set([index]))
    setEditing({ index, text: covers[index].text ?? '' })
  }
  // The answer being typed, read once as it is kept: Enter keeps it and the blur that follows finds nothing left to keep.
  const typed = useRef(editing)
  useLayoutEffect(() => void (typed.current = editing), [editing])
  const keepAnswer = (then?: number): void => {
    const now = typed.current
    if (!now) return
    typed.current = null
    const text = now.text.trim()
    const next = text !== (covers[now.index]?.text ?? '') ? covers.map((one, at) => (at === now.index ? { ...one, text: text || undefined } : one)) : null
    if (next) {
      chime('saved')
      putCovers(next)
    }
    setEditing(null)
    // Tab: on to the next cover's answer, in the cards' order.
    if (then !== undefined) {
      setEditing({ index: then, text: (next ?? covers)[then]?.text ?? '' })
      pick(new Set([then]))
    }
  }
  const inOrder = covers.map((_, at) => at).sort((a, b) => (renumber.get(covers[a].group) ?? 0) - (renumber.get(covers[b].group) ?? 0) || covers[a].y - covers[b].y || covers[a].x - covers[b].x)

  const make = (): void => {
    if (!picture || !covers.length) return refuse('Cover at least one part of the picture first')
    const tag = deckTagOf(deck)
    void call<string[]>('cards:picture', { src: picture.src, covers: covers.map((one) => ({ ...one, id: undefined, group: renumber.get(one.group)! })), hide, question: question.trim(), deck: tag, tags: tagsIn(tags), from: picture.from }).then((ids) => {
      chime('added')
      made.current = true
      onClose()
      toast(`${plural(ids.length, 'card')} made from the picture${tag ? ` in the deck ${deckTitle(tag)}` : ''}`, () => void call('cards:list:undo', ids).then(() => chime('undo')), 'success', onShow ? { label: 'Show them', key: 'S', run: () => onShow(ids) } : undefined)
    })
  }
  const keys = (event: React.KeyboardEvent): void => {
    const target = event.target as HTMLElement
    const typing = !!target.closest('input, textarea')
    // ⌘↵ makes and Esc closes from anywhere in it, the tags field too, as in the other two forms.
    if (event.metaKey && event.key === 'Enter') return void (event.preventDefault(), make())
    if (target.closest('[data-cover-answer-field]')) return
    if (event.key === 'Escape' && typing) return void (event.preventDefault(), onClose())
    if (typing) return
    const key = event.key.toLowerCase()
    if (picture && event.metaKey && !event.altKey && !event.ctrlKey) {
      // ⌘+ ⌘− ⌘0 zoom the picture while the maker has it (the app's own size is taken by them everywhere else).
      const way = event.code === 'Equal' || event.code === 'NumpadAdd' ? 1 : event.code === 'Minus' || event.code === 'NumpadSubtract' ? -1 : event.code === 'Digit0' || event.code === 'Numpad0' ? 0 : null
      if (way !== null) return void (event.preventDefault(), way === 0 ? zoomTo(1) : step(way))
      if (key === 'z') return void (event.preventDefault(), event.shiftKey ? redo() : undo())
      if (key === 'a') return void (event.preventDefault(), pickAll())
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') return void (event.preventDefault(), picked.size || pickedLabels.size ? (chime('tap'), pick(new Set())) : onClose())
    if (!picture) return
    if (event.key === 'Backspace' || event.key === 'Delete') return void (event.preventDefault(), remove())
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (arrow) {
      event.preventDefault()
      if (picked.size) return nudge(arrow[0] * (event.shiftKey ? 10 : 1), arrow[1] * (event.shiftKey ? 10 : 1), event.repeat)
      // Nothing picked: ← → go through the cards in the preview.
      if (arrow[0] && cards.length > 1) {
        chime('slide')
        setSeeing((shown + arrow[0] + cards.length) % cards.length)
      }
      return
    }
    if (event.key === 'Enter' && !target.closest('button')) {
      if (picked.size !== 1) return
      event.preventDefault()
      return edit([...picked][0])
    }
    const one = TOOLS.find((it) => it.key.toLowerCase() === key)
    if (one) return void (chime('tap'), setTool(one.id))
    if (key === 'g') return void group(event.shiftKey)
    if (key === 'a') return void coverAll()
  }

  // Drawing: where the pointer is, as a share of the picture.
  const at = (event: { clientX: number; clientY: number }): [number, number] => {
    const box = board.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))]
  }
  const far = (a: [number, number], b: [number, number]): boolean => Math.hypot((a[0] - b[0]) * across, (a[1] - b[1]) * down_) >= 4
  const press = (event: React.PointerEvent<HTMLDivElement>): void => {
    // One pointer at a time: a second finger mid-drag never makes the cover jump.
    if (event.button !== 0 || !size || gesture.current) return
    if (editing) keepAnswer()
    ;(event.currentTarget.closest('[data-card-form]') as HTMLElement | null)?.focus({ preventScroll: true })
    const target = event.target as Element
    const point = at(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    const handle = target.closest('[data-cover-handle]')
    if (handle && picked.size === 1) {
      gesture.current = { kind: 'resize', corner: Number(handle.getAttribute('data-cover-handle')), was: doc, index: [...picked][0] }
      return
    }
    const hit = target.closest('[data-made-cover]')
    if (hit) {
      // A cover pressed is picked (with ⇧ it joins the ones picked) and moves with the pointer, every picked cover with it.
      const index = Number(hit.getAttribute('data-made-cover'))
      const already = picked.has(index)
      if (event.shiftKey) {
        chime('tap')
        const next = new Set(picked)
        if (already) next.delete(index)
        else next.add(index)
        pick(next, pickedLabels)
        if (already) return
      } else if (!already) {
        chime('tap')
        pick(new Set([index]))
      }
      gesture.current = { kind: 'move', start: point, was: doc, far: false, index, alone: already && !event.shiftKey && picked.size > 1 }
      return
    }
    const label = target.closest('[data-found-label]')
    const labelAt = label ? Number(label.getAttribute('data-found-label')) : null
    if (tool === 'select') {
      gesture.current = { kind: 'marquee', start: point, add: event.shiftKey, label: labelAt, covers: event.shiftKey ? new Set(picked) : new Set(), labels: event.shiftKey ? new Set(pickedLabels) : new Set() }
      return
    }
    gesture.current = { kind: 'draw', start: point, label: labelAt }
    setDrawing(tool === 'shape' || tool === 'brush'
      ? { kind: tool, x: point[0], y: point[1], w: 0, h: 0, points: [point], size: tool === 'brush' ? 0.03 : undefined, group: nextGroup() }
      : { kind: tool, x: point[0], y: point[1], w: 0, h: 0, group: nextGroup() })
  }
  const drag = (event: React.PointerEvent): void => {
    const now = gesture.current
    if (!now || !size) return
    const point = at(event)
    if (now.kind === 'draw') {
      if (!drawing) return
      if (drawing.points) {
        const last = drawing.points.at(-1)!
        if (Math.hypot((point[0] - last[0]) * across, (point[1] - last[1]) * down_) < 3) return
        const points = [...drawing.points, point]
        return setDrawing({ ...drawing, ...boxOf(points), points })
      }
      const [x0, y0] = now.start
      return setDrawing({ ...drawing, x: Math.min(x0, point[0]), y: Math.min(y0, point[1]), w: Math.abs(point[0] - x0), h: Math.abs(point[1] - y0) })
    }
    if (now.kind === 'marquee') {
      const box = { x: Math.min(now.start[0], point[0]), y: Math.min(now.start[1], point[1]), w: Math.abs(point[0] - now.start[0]), h: Math.abs(point[1] - now.start[1]) }
      if (!far(now.start, point) && !marquee) return
      setMarquee(box)
      // Everything it touches is picked as it is drawn, as in Finder.
      const nextCovers = new Set(now.covers)
      covers.forEach((one, index) => touches(box, extent(one, aspect)) && nextCovers.add(index))
      const nextLabels = new Set(now.labels)
      open.forEach(({ label, index }) => touches(box, label) && nextLabels.add(index))
      setPicked(nextCovers)
      setPickedLabels(nextLabels)
      return
    }
    if (now.kind === 'move') {
      if (!now.far && !far(now.start, point)) return
      now.far = true
      const dx = point[0] - now.start[0]
      const dy = point[1] - now.start[1]
      // The picked covers move as one, kept inside the picture together.
      const them = now.was.covers.map((one, index) => (picked.has(index) ? extent(one, aspect) : null)).filter(Boolean) as Box[]
      const left = Math.min(...them.map((one) => one.x))
      const top = Math.min(...them.map((one) => one.y))
      const right = Math.max(...them.map((one) => one.x + one.w))
      const bottom = Math.max(...them.map((one) => one.y + one.h))
      const mx = Math.min(1 - right, Math.max(-left, dx))
      const my = Math.min(1 - bottom, Math.max(-top, dy))
      setDoc({ ...now.was, covers: now.was.covers.map((one, index) => (picked.has(index) ? moved(one, mx, my) : one)) })
      return
    }
    // A corner dragged: the corner across from it stays put. Never smaller than a cover can be.
    const was = now.was.covers[now.index]
    const box = extent(was, aspect)
    const fixed: [number, number] = [now.corner % 3 === 0 ? box.x + box.w : box.x, now.corner < 2 ? box.y + box.h : box.y]
    const least = [16 / across, 16 / down_]
    const x = point[0] < fixed[0] ? Math.min(point[0], fixed[0] - least[0]) : Math.max(point[0], fixed[0] + least[0])
    const y = point[1] < fixed[1] ? Math.min(point[1], fixed[1] - least[1]) : Math.max(point[1], fixed[1] + least[1])
    const to = { x: Math.min(x, fixed[0]), y: Math.min(y, fixed[1]), w: Math.abs(x - fixed[0]), h: Math.abs(y - fixed[1]) }
    // A brush's path is its box less the stroke's width round it.
    const pad = was.kind === 'brush' ? [box.w - was.w, box.h - was.h] : [0, 0]
    const next = resized(was, { x: to.x + pad[0] / 2, y: to.y + pad[1] / 2, w: Math.max(0.001, to.w - pad[0]), h: Math.max(0.001, to.h - pad[1]) })
    setDoc({ ...now.was, covers: now.was.covers.map((one, index) => (index === now.index ? inside(next, aspect) : one)) })
  }
  const lift = (event: React.PointerEvent): void => {
    const now = gesture.current
    gesture.current = null
    if (!now || !size) return
    const point = at(event)
    if (now.kind === 'move' || now.kind === 'resize') {
      const changed = doc !== now.was && JSON.stringify(doc.covers) !== JSON.stringify(now.was.covers)
      if (changed) {
        chime(now.kind === 'move' ? 'move' : 'settled')
        setPast((was) => [...was, now.was])
        setFuture([])
      } else if (now.kind === 'move' && now.alone) pick(new Set([now.index]))
      return
    }
    if (now.kind === 'marquee') {
      const box = marquee
      setMarquee(null)
      if (!box) {
        // A click, not a drag: on a label it covers it; on the picture, the pick is let go.
        if (now.label !== null) return coverLabel(now.label)
        if (!now.add && (picked.size || pickedLabels.size)) pick(new Set())
        return
      }
      if (picked.size || pickedLabels.size) chime('select')
      return
    }
    const done = drawing
    setDrawing(null)
    if (!done) return
    if (!far(now.start, point) && now.label !== null) return coverLabel(now.label)
    // Too small to see or to be meant (a click, a tremble of the hand): no cover, and nothing counted.
    if (!seen(done, across, down_)) {
      if (picked.size || pickedLabels.size) pick(new Set())
      return
    }
    const cover = inside(snapped(done, open.map(({ label }) => label)), aspect)
    // Laid on a cover that is there already: that one is picked, never a second one hidden under it.
    const under = covers.findIndex((one) => stacked(one, cover))
    if (under >= 0) {
      chime('nope')
      pick(new Set([under]))
      return refuse(`Card ${num(renumber.get(covers[under].group) ?? 0)} covers that already: it is picked`)
    }
    chime('pop')
    putCovers([...covers, withId(cover)])
    pick(new Set([covers.length]))
  }
  const coverLabel = (index: number): void => {
    const label = found[index]
    if (!label) return
    chime('pop')
    putCovers([...covers, withId(coverOf(label, nextGroup()))])
    pick(new Set([covers.length]))
  }

  // Its covers are not lost: Undo puts the picture back as it was.
  const another = (): void => {
    const was = { picture, labels, doc, past }
    chime('fold')
    asking.current = ''
    setPicture(null)
    setLabels(null)
    setDoc(EMPTY)
    setPast([])
    setFuture([])
    pick(new Set())
    setEditing(null)
    if (was.doc.covers.length) toast('The picture and its covers are put aside', () => restore(was))
  }

  // Where a cover's number sits: just inside its top left (on an oval, on its curve; on a free shape or a stroke, on
  // where it starts), or, on a cover too small to hold it, just outside its top right corner. Always inside the picture.
  const badgeAt = (cover: Cover, box: Box, roomy: boolean): React.CSSProperties => {
    const pad = [13 / across, 13 / down_]
    const [x, y] = !roomy ? [box.x + box.w + pad[0] * 0.8, box.y]
      : cover.kind === 'oval' ? [box.x + box.w / 2 - (box.w / 2) * 0.62, box.y + box.h / 2 - (box.h / 2) * 0.62]
        : cover.kind === 'brush' && cover.points?.length ? cover.points[0]
          : cover.points?.length ? [cover.points.reduce((sum, one) => sum + one[0], 0) / cover.points.length, cover.points.reduce((sum, one) => sum + one[1], 0) / cover.points.length]
          : [box.x + pad[0], box.y + pad[1]]
    return { left: `${Math.min(1 - pad[0] * 0.75, Math.max(pad[0] * 0.75, x)) * 100}%`, top: `${Math.min(1 - pad[1] * 0.75, Math.max(pad[1] * 0.75, y)) * 100}%` }
  }
  const toolName = TOOLS.find((one) => one.id === tool)!.label.toLowerCase()
  const say = !picture || labels === 'finding'
    ? 'Cover the parts of a picture you want to be asked; each cover becomes a card that asks what is under it.'
    : found.length
      ? `${plural(found.length, 'label')} found on it, on this Mac, without the internet. Click a dashed one to cover it, or draw your own.`
      : 'Draw a cover over each part you want to be asked. Each cover is one card; type its answer on it if you like.'
  const many = picked.size + pickedLabels.size
  const hint = labels === 'finding' ? null
    : editing ? <><Kbd>↵</Kbd> keeps the answer · <Kbd>Tab</Kbd> the next cover · <Kbd>Esc</Kbd> leaves it as it was</>
      : picked.size === 1 && !pickedLabels.size ? <>Double-click or <Kbd>↵</Kbd> to type its answer · drag to move · <Kbd>⌫</Kbd> removes</>
        : many > 1 ? <>{num(many)} picked · <Kbd>G</Kbd> asks the covers together · <Kbd>⌫</Kbd> removes {pickedLabels.size ? 'them, and sets the labels aside' : 'them'}</>
          : tool === 'select' ? <>Drag across covers or labels to pick them · <Kbd>⌘A</Kbd> picks every cover</>
            : covers.length ? <>Drag to draw another {toolName} · <Kbd>V</Kbd> to pick and move · <Kbd>⌘Z</Kbd> undoes</>
              : <>Drag on the picture to draw a {toolName}{open.length ? ', or click a dashed label to cover it' : ''}</>
  const asked = cards[shown]
  const answer = covers.filter((one) => one.group === asked).map((one) => one.text?.trim()).filter(Boolean).join(', ')

  return (
    <CardForm data-picture-cards head="Cards from a picture" line={<span data-picture-said>{say}</span>} keys={keys}
      foot={<CardFormFoot mark="picture-make" deck={deck} onDeck={setDeck} tags={tags} onTags={setTags} onCancel={onClose}
        go={covers.length ? `Make ${plural(groups.length, 'card')}` : 'Make the cards'} ready={!!covers.length} onGo={make} />}>
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
          className="grid gap-3 rounded-[4px] border border-dashed border-foreground/20 px-4 py-4">
          {/* The first thing to do, first: a real button, then the other ways in, said beside it. */}
          <span className="flex flex-wrap items-center gap-3 text-control text-(--mf-muted-strong)">
            <input ref={file} type="file" accept="image/*" data-picture-file className="sr-only" tabIndex={-1} onChange={(event) => fromFile(event.target.files?.[0] ?? null)} />
            <Button size="sm" className="h-8 cursor-pointer gap-1.5 px-3" data-picture-choose onClick={() => (chime('open'), file.current?.click())}><ImagePlus className="size-4" />Choose a picture…</Button>
            <span>or drop one on this box, or paste one with <Kbd>⌘V</Kbd></span>
          </span>
          {/* Snips from a book (they keep its title and page) and pictures already in notes. */}
          {!!sources?.length && (
            <span className="grid gap-2">
              <span className="text-xs text-muted-foreground">Or one you already have: snips from your books, then pictures in your notes</span>
              {/* Comes in whole, its first pictures drawn in its first frame. */}
              <ReadsIn data-picture-sources="" data-lenis-prevent="" className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 overflow-y-auto overscroll-contain">
                {sources.map((one, at) => (
                  <button key={one.src} type="button" data-picture-source onClick={() => choose(one.src, one.id ? { id: one.id } : null, one.title)}
                    className="grid cursor-pointer content-start gap-1 rounded-[4px] border border-foreground/10 p-1.5 text-left transition-colors hover:bg-accent/60">
                    <Decoded src={small(one.src)} ahead={at < FIRST_PICTURES} className="aspect-square w-full rounded-[3px] bg-accent/40 object-cover" />
                    <span className="truncate text-xs text-(--mf-muted-strong)">{one.title}</span>
                  </button>
                ))}
              </ReadsIn>
            </span>
          )}
        </div>
      ) : (
        <>
          {/* One small toolbar: what you draw with, what acts on the picked covers, then the picture's zoom. It stays put. */}
          <div data-picture-tools className="flex flex-wrap items-center gap-2">
            <span role="radiogroup" aria-label="Draw with" className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 max-sm:h-9">
              {TOOLS.map((one) => (
                <Tip key={one.id} label={`${one.tip}  ${one.key}`}>
                  <button type="button" role="radio" aria-checked={tool === one.id} aria-label={one.label} data-picture-tool={one.id} onClick={() => (chime('tap'), setTool(one.id))}
                    className={`grid h-7 w-8 cursor-pointer place-items-center rounded-md border transition-colors active:scale-[0.97] max-sm:h-8 ${tool === one.id ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    <one.icon className="size-4" strokeWidth={tool === one.id ? 2.2 : 1.8} />
                  </button>
                </Tip>
              ))}
            </span>
            {!!found.length && (
              <Tip label={open.length ? 'Each label found becomes its own card  A' : 'Every label found is covered, or set aside'}>
                <span><Button variant="outline" size="sm" className="h-8 cursor-pointer gap-1.5 px-2.5 max-sm:h-9" data-picture-cover-all disabled={!open.length} onClick={coverAll}>
                  <ScanText className="size-4" />{open.length ? <>Cover every label <span className="font-normal text-muted-foreground tabular-nums">{num(open.length)}</span></> : 'Every label covered'}
                </Button></span>
              </Tip>
            )}
            <Tip label={together ? 'Ask each picked cover on its own card  ⇧G' : picked.size > 1 ? 'Ask the picked covers on one card, all hidden at once  G' : 'Pick two or more covers first, then ask them on one card  G'}>
              <span><Button variant="ghost" size="sm" className="h-8 cursor-pointer gap-1.5 px-2.5 max-sm:h-9" data-picture-group={together ? 'apart' : 'together'} disabled={!together && picked.size < 2} onClick={() => group(together)}>
                {together ? <Ungroup className="size-4" /> : <Group className="size-4" />}{together ? 'Ask apart' : 'Ask together'}
              </Button></span>
            </Tip>
            <span className="flex items-center">
              <Tip label="Undo  ⌘Z"><span><Button variant="ghost" size="sm" aria-label="Undo" data-picture-undo className="size-8 cursor-pointer p-0 max-sm:size-9" disabled={!past.length} onClick={undo}><Undo2 className="size-4" /></Button></span></Tip>
              <Tip label="Redo  ⇧⌘Z"><span><Button variant="ghost" size="sm" aria-label="Redo" data-picture-redo className="size-8 cursor-pointer p-0 max-sm:size-9" disabled={!future.length} onClick={redo}><Redo2 className="size-4" /></Button></span></Tip>
            </span>
            <span className="flex-1" />
            <span data-picture-zoom-row className="flex h-8 items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 max-sm:h-9">
              <Tip label="Zoom out  ⌘−"><button type="button" aria-label="Zoom out" data-picture-zoom-out disabled={zoom <= 1} onClick={() => step(-1)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40 max-sm:h-8"><Minus className="size-3.5" /></button></Tip>
              <Tip label="Fit the picture  ⌘0"><button type="button" data-picture-zoom onClick={() => zoomTo(1)} className="h-7 w-12 cursor-pointer rounded-md text-control text-(--mf-muted-strong) tabular-nums transition-colors hover:text-foreground max-sm:h-8">{Math.round(zoom * 100)}%</button></Tip>
              <Tip label="Zoom in  ⌘+"><button type="button" aria-label="Zoom in" data-picture-zoom-in disabled={zoom >= 4} onClick={() => step(1)} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40 max-sm:h-8"><Plus className="size-3.5" /></button></Tip>
            </span>
          </div>
          {/* The question asked over the picture on every card, written on the card as the other forms write (Anki's Header). */}
          <input data-picture-question value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={200}
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), (event.currentTarget.closest('[data-card-form]') as HTMLElement | null)?.focus())}
            placeholder="A question on every card, if you like: “Name the figure”" aria-label="A question on every card"
            className={`${CARD_FIELD} text-body font-medium`} />
          <div ref={room} className="w-full">
            <div ref={stage} data-picture-stage data-swipe-own={zoom > 1 || undefined} data-lenis-prevent={zoom > 1 || undefined} className={`relative mx-auto rounded-[4px] ${zoom > 1 ? 'overflow-auto overscroll-contain' : 'overflow-hidden'}`} style={{ width: view.w || undefined, height: view.h || undefined }}>
              <div ref={board} data-picture-board className={`relative touch-none select-none ${tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`} style={{ width: across || undefined, height: down_ || undefined }}
                onPointerDown={press} onPointerMove={drag} onPointerUp={lift}
                // The pointer let go somewhere the board never heard of (the window lost it): finished as a letting go, never stuck mid-drag.
                onLostPointerCapture={(event) => gesture.current && lift(event)}
                onPointerCancel={() => (gesture.current = null, setDrawing(null), setMarquee(null))}
                onDoubleClick={(event) => {
                  // The board holds the pointer while a press lasts, so the double-click is its own: the cover is the one under the pointer.
                  const hit = document.elementsFromPoint(event.clientX, event.clientY).map((one) => one.closest('[data-made-cover]')).find(Boolean)
                  if (hit) edit(Number(hit.getAttribute('data-made-cover')))
                }}>
                <img src={picture.src} alt="" draggable={false} className="block size-full" />
                {size && !!across && (
                  <>
                    <svg viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 size-full overflow-hidden">
                      {/* Labels found and not yet covered: a dashed outline, clicked to cover. Picked, a solid ring. */}
                      {open.map(({ label, index }) => (
                        <rect key={`l${index}`} data-found-label={index} data-picked={pickedLabels.has(index) || undefined} x={label.x * size.w} y={label.y * size.h} width={label.w * size.w} height={label.h * size.h} rx={round / 2}
                          fill={pickedLabels.has(index) ? 'color-mix(in oklab, var(--primary) 18%, transparent)' : 'transparent'} stroke="var(--primary)" strokeOpacity={pickedLabels.has(index) ? 1 : 0.6}
                          strokeDasharray={pickedLabels.has(index) ? undefined : '5 3'} strokeWidth={pickedLabels.has(index) ? 2 : 1.5} vectorEffect="non-scaling-stroke" className="cursor-pointer" />
                      ))}
                      <AnimatePresence initial={false}>
                        {covers.map((cover, index) => (
                          <motion.g key={cover.id ?? `c${index}`} data-made-cover={index} data-picked={picked.has(index) || undefined} data-hover={hover === index || undefined}
                            onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(index)} onPointerLeave={() => setHover((was) => (was === index ? null : was))}
                            // A cover lands with a small settle, and lifts away when removed.
                            initial={still() ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={still() ? { opacity: 0, transition: { duration: 0.08 } } : { opacity: 0, scale: 1.04, y: -size.h * 0.01, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
                            transition={{ type: 'spring', duration: 0.28, bounce: 0.25 }}
                            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                            className="cursor-pointer">
                            <Shape cover={cover} w={size.w} h={size.h} round={round} fill={hover === index && !picked.has(index) ? INK_HOVER : INK} {...(cover.kind === 'brush' ? {} : { stroke: 'var(--background)', strokeOpacity: 0.85, strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' })} filter="drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.25))" />
                          </motion.g>
                        ))}
                      </AnimatePresence>
                      {/* The picked ones ringed in the accent; their card's other covers, a dashed ring. */}
                      {covers.map((cover, index) => {
                        const mate = !picked.has(index) && pickedGroup.includes(cover.group) && !!picked.size
                        if (!picked.has(index) && !mate) return null
                        // A brush stroke is ringed by the room it takes: a line round a line reads as a second stroke.
                        const ring = cover.kind === 'brush' ? { ...cover, ...extent(cover, aspect), kind: 'box' as const, points: undefined } : cover
                        return <Shape key={`r${index}`} cover={ring} w={size.w} h={size.h} round={round} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray={mate ? '4 3' : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      })}
                      {drawing && <Shape cover={drawing} w={size.w} h={size.h} round={round} fill={INK} opacity={0.6} pointerEvents="none" />}
                    </svg>
                    {/* Over the covers: each one's number (always on top, so a cover laid near another still shows its own), its answer, the handles. */}
                    <div className="pointer-events-none absolute inset-0">
                      {covers.map((cover, index) => {
                        const box = extent(cover, aspect)
                        const wide = box.w * across
                        const high = box.h * down_
                        const words = cover.text?.trim()
                        // Words show on a cover only whole (about 7 points a letter at this size), never cut to "Mitochon…".
                        const fits = !!words && high >= 22 && words.length * 7.4 + 14 <= wide
                        // The number inside when there is room beside the words; else just outside its top right.
                        const roomy = wide >= 30 && high >= (fits ? 48 : 26)
                        return (
                          <span key={cover.id ?? index} className="contents">
                            <span data-cover-badge={renumber.get(cover.group)} className={`absolute grid h-[18px] min-w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background px-1 text-[11px] leading-none font-semibold text-foreground tabular-nums shadow-sm ring-1 ring-foreground/15 ${picked.has(index) ? 'ring-2 ring-primary' : ''}`}
                              style={badgeAt(cover, box, roomy)}>
                              {renumber.get(cover.group)}
                            </span>
                            {fits && !(editing?.index === index) && (
                              <span data-cover-words className="absolute flex items-center justify-center overflow-hidden px-1.5 text-center text-control font-medium whitespace-nowrap text-background"
                                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
                                {words}
                              </span>
                            )}
                          </span>
                        )
                      })}
                      {picked.size === 1 && !editing && (() => {
                        const one = covers[[...picked][0]]
                        if (!one) return null
                        const box = extent(one, aspect)
                        // Four corners: drag one to resize, the one across from it stays put.
                        return [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([x, y], corner) => (
                          <span key={corner} data-cover-handle={corner} className={`pointer-events-auto absolute size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-[1.5px] border-primary bg-background shadow-sm ${corner % 2 ? 'cursor-nesw-resize' : 'cursor-nwse-resize'}`}
                            style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
                        ))
                      })()}
                      {marquee && <span data-picture-marquee className="absolute rounded-[2px] border border-primary bg-primary/10" style={{ left: `${marquee.x * 100}%`, top: `${marquee.y * 100}%`, width: `${marquee.w * 100}%`, height: `${marquee.h * 100}%` }} />}
                      {editing && covers[editing.index] && (() => {
                        const box = extent(covers[editing.index], aspect)
                        // The answer typed right on the cover, as wide as it or wide enough to read.
                        return (
                          <span className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center" style={{ left: `${(box.x + box.w / 2) * 100}%`, top: `${(box.y + box.h / 2) * 100}%`, width: `max(10rem, ${box.w * across}px)`, maxWidth: across }}>
                            <input autoFocus data-cover-answer-field value={editing.text} placeholder="Its answer, in words" aria-label="The cover's answer"
                              onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                              onBlur={() => keepAnswer()}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                                if (event.key === 'Enter') return void (event.preventDefault(), keepAnswer(), (event.currentTarget.closest('[data-card-form]') as HTMLElement | null)?.focus())
                                if (event.key === 'Escape') return void (event.preventDefault(), setEditing(null), (event.currentTarget.closest('[data-card-form]') as HTMLElement | null)?.focus())
                                if (event.key === 'Tab') {
                                  event.preventDefault()
                                  const at = inOrder.indexOf(editing.index)
                                  keepAnswer(inOrder[(at + (event.shiftKey ? -1 : 1) + inOrder.length) % inOrder.length])
                                }
                              }}
                              className="h-8 w-full rounded-md border border-primary bg-background px-2 text-center text-control text-foreground shadow-md outline-none placeholder:text-muted-foreground" />
                          </span>
                        )
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* One short line for what to do now, and the way to start again with another picture. */}
          <div className="flex min-h-6 items-center gap-2">
            <p data-picture-hint className="h-6 min-w-0 flex-1 truncate text-sm leading-6 text-muted-foreground @max-[40rem]/page:text-xs">
              {labels === 'finding' ? <Orb label="Looking for labels on the picture, on this Mac…" />
                : labels && !Array.isArray(labels) ? labels.error : hint}
            </p>
            <Button variant="ghost" size="sm" className="-my-1 h-7 shrink-0 cursor-pointer gap-1.5 px-2 text-muted-foreground max-sm:h-8" data-picture-other onClick={another}><ImagePlus className="size-3.5" />Another picture</Button>
          </div>
          {/* The card as it will be asked: the covers as they will look, the asked one glowing; ← → go card by card. */}
          <div data-picture-preview className="flex items-center gap-4 rounded-[6px] bg-foreground/[0.035] p-2.5 @max-[40rem]/page:flex-col @max-[40rem]/page:items-stretch">
            <div className="grid h-24 w-36 shrink-0 place-items-center overflow-hidden rounded-[4px] @max-[40rem]/page:mx-auto">
              {asked !== undefined
                ? <CoveredPicture occlusion={{ src: picture.src, covers, ask: asked, hide, question }} shown={false} fit="max-h-24" />
                : <img src={picture.src} alt="" className="max-h-24 w-auto rounded-[4px] opacity-60" />}
            </div>
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div className="flex items-center gap-1">
                <span data-preview-card className="text-control font-semibold text-foreground tabular-nums">{cards.length ? `Card ${num(shown + 1)} of ${num(cards.length)}` : 'No cards yet'}</span>
                <span className="flex-1" />
                <Tip label="The card before  ←"><span><Button variant="ghost" size="sm" aria-label="The card before" data-preview-back disabled={cards.length < 2} className="size-7 cursor-pointer p-0 max-sm:size-8" onClick={() => (chime('slide'), setSeeing((shown - 1 + cards.length) % cards.length))}><ChevronLeft className="size-4" /></Button></span></Tip>
                <Tip label="The next card  →"><span><Button variant="ghost" size="sm" aria-label="The next card" data-preview-next disabled={cards.length < 2} className="size-7 cursor-pointer p-0 max-sm:size-8" onClick={() => (chime('slide'), setSeeing((shown + 1) % cards.length))}><ChevronRight className="size-4" /></Button></span></Tip>
              </div>
              <p data-preview-says className="truncate text-sm text-muted-foreground">
                {asked === undefined ? 'Each cover you draw shows here as the card it makes.'
                  : <>{question.trim() || 'What is hidden?'} <span className="text-foreground/50">·</span> {answer ? <>Answer: <b className="font-semibold text-foreground">{answer}</b></> : 'Answer: shown on the picture, under the cover'}</>}
              </p>
              {/* How each card is asked, said as what you will see when studying. */}
              <span role="radiogroup" aria-label="When studying" className="flex h-8 w-fit items-center rounded-lg border border-foreground/10 bg-accent/40 p-0.5 text-control max-sm:h-9 @max-[40rem]/page:w-full">
                {(['one', 'all'] as const).map((one) => (
                  <button key={one} type="button" role="radio" aria-checked={hide === one} data-picture-hide={one} onClick={() => (chime('tap'), setHide(one))}
                    className={`h-7 cursor-pointer rounded-md border px-2.5 transition-colors active:scale-[0.97] max-sm:h-8 @max-[40rem]/page:flex-1 ${hide === one ? 'border-foreground/15 bg-background text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{one === 'one' ? 'Each card hides one' : 'Each card hides all'}</button>
                ))}
              </span>
            </div>
          </div>
        </>
      )}
    </CardForm>
  )
}
