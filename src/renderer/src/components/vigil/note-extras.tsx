import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlignLeft, Check, Clock3, LayoutGrid, List, ListChecks, Star, Type, X } from 'lucide-react'
import { motion } from 'motion/react'

import { CAPTURE_TYPES } from '../capture-kinds/capture-kind-picker'
import { KIND_FIELDS } from '../capture-kinds/kind-fields'
import { Command, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { chime, step } from '@/lib/sound'
import { notes, openWindow, smallPicture, useThumb, type GraphNode, type NoteTable, type Version } from '@/lib/notes'
import { splitTags, useLive } from '@/lib/vigil'
import { Chips } from './display'
import { RowMenu, type MenuItem } from './row-menu'
import { PropInput, PropLabel, Rolling, Tip, Typed, VirtualList, toast } from './ui'

// --- a note's first picture, small

/** A note's first picture, small, or nothing at all. Rows are only drawn in view, so this is lazy already. */
export function Thumb({ id, className = 'size-9' }: { id: string; className?: string }): React.JSX.Element | null {
  const src = useThumb(id)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    setShown(null)
    if (src) void smallPicture(src).then(setShown)
  }, [src])
  if (!src) return null
  return (
    <span className={`block shrink-0 overflow-hidden rounded-md border bg-accent/40 ${className}`}>
      {shown && <img src={shown} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover animate-in fade-in-0 duration-200" />}
    </span>
  )
}

// --- dragging rows into your own order

/**
 * What a row needs to be dragged onto another, and the line showing where it
 * would land: above the row or below it, by which half the pointer is over.
 * Nothing at all without `onMove`, so a list not in your own order never drags.
 */
export function useRowDrag(onMove?: (id: string, target: string, after: boolean) => void): {
  drag: (id: string) => React.ButtonHTMLAttributes<HTMLButtonElement>
  line: (id: string) => React.JSX.Element | null
} {
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  return {
    drag: (id) => onMove ? {
      draggable: true,
      onDragStart: (event) => event.dataTransfer.setData('text/vigil-row', id),
      onDragOver: (event) => {
        if (!event.dataTransfer.types.includes('text/vigil-row')) return
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        const after = event.clientY > box.top + box.height / 2
        if (over?.id !== id || over.after !== after) setOver({ id, after })
      },
      onDragLeave: () => setOver(null),
      onDrop: (event) => {
        const dragged = event.dataTransfer.getData('text/vigil-row')
        setOver(null)
        if (dragged) onMove(dragged, id, over?.after ?? false)
      }
    } : {},
    line: (id) => over?.id === id ? <span aria-hidden className={`pointer-events-none absolute right-2 left-2 h-0.5 rounded-full bg-[var(--tt-brand-color-400)] ${over.after ? '-bottom-px' : '-top-px'}`} /> : null
  }
}

// --- list or cards

export type Layout = 'list' | 'cards'
/** Each list's own choice of list or cards, kept in this window like Display's. */
export function useLayout(name: string): [Layout, (layout: Layout) => void] {
  const key = `layout:${name}`
  const read = (): Layout => {
    try {
      return localStorage.getItem(key) === 'cards' ? 'cards' : 'list'
    } catch {
      return 'list'
    }
  }
  const [layout, setLayout] = useState(read)
  useEffect(() => setLayout(read()), [name]) // eslint-disable-line react-hooks/exhaustive-deps
  return [layout, (next) => {
    setLayout(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // Applied, not kept.
    }
  }]
}

export function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }): React.JSX.Element {
  return (
    <span className="flex items-center rounded-md border">
      {([['list', List, 'As a list'], ['cards', LayoutGrid, 'As cards, with pictures']] as const).map(([id, Icon, label], index) => (
        <Tip key={id} label={label}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={layout === id}
            onClick={() => {
              if (layout === id) return
              chime(id === 'cards' ? 'slide' : 'fold')
              onChange(id)
            }}
            className={`flex h-6 w-7 items-center justify-center ${index ? 'border-l' : ''} ${layout === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="size-3.5" />
          </button>
        </Tip>
      ))}
    </span>
  )
}

export type Card = { id: string; title: string; kind: string; dim?: boolean; type: string }

/**
 * Notes as cards: the picture, the name, and the first lines under it. Rows
 * of cards, drawn only in view, as many across as fit.
 */
export function NoteCards({ cards, table, selected, cursor = -1, onPick, menu }: {
  cards: Card[]
  table: NoteTable
  selected?: string
  cursor?: number
  onPick: (id: string) => void
  menu?: (card: Card) => MenuItem[]
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [across, setAcross] = useState(3)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const fit = (): void => setAcross(Math.max(1, Math.floor(element.clientWidth / 200)))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(element)
    return () => watch.disconnect()
  }, [])
  const glance = useLive(() => notes.glance(table), {} as Record<string, string>, [table])
  const rows = Array.from({ length: Math.ceil(cards.length / across) }, (_, at) => cards.slice(at * across, at * across + across))
  return (
    <div ref={box} className="px-3 py-2">
      <VirtualList items={rows} keyOf={(row) => row[0].id} cursor={cursor >= 0 ? Math.floor(cursor / across) : undefined} estimate={190}>
        {(row, rowAt) => (
          <div className="grid gap-2 pb-2" style={{ gridTemplateColumns: `repeat(${across}, minmax(0, 1fr))` }}>
            {row.map((card, at) => {
              const index = rowAt * across + at
              const kind = CAPTURE_TYPES.find((type) => type.id === card.kind) ?? CAPTURE_TYPES[0]
              const { text } = splitTags(card.title)
              // The words after the name, which the name already says.
              const rest = (glance[card.id] ?? '').split('\n').filter((line) => line.trim() && !text.startsWith(line.trim().slice(0, 40))).join('\n')
              const face = (
                <button
                  type="button"
                  data-row
                  data-cursor={index === cursor || undefined}
                  data-id={card.id}
                  onClick={(event) => (event.metaKey ? openWindow(card.type, card.id) : onPick(card.id))}
                  className={`flex h-44 w-full flex-col overflow-hidden rounded-lg border text-left transition-colors hover:bg-accent/40 ${card.dim ? 'opacity-50' : ''} ${card.id === selected ? 'border-ring bg-accent/60' : index === cursor ? 'bg-accent/40' : ''}`}
                >
                  <Thumb id={card.id} className="h-20 w-full rounded-none border-0 border-b" />
                  <span className="flex items-center gap-1.5 px-2.5 pt-2">
                    <kind.icon className="size-3.5 shrink-0" style={{ color: kind.tint }} />
                    <span className="private-text truncate text-sm font-medium">{text || 'Untitled'}</span>
                  </span>
                  <span className="private-text mt-1 line-clamp-4 px-2.5 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{rest}</span>
                </button>
              )
              return <div key={card.id}>{menu ? <RowMenu items={menu(card)}>{face}</RowMenu> : face}</div>
            })}
          </div>
        )}
      </VirtualList>
    </div>
  )
}

// --- a new kind, asked for from a menu or ⌘K

/** The kinds as a short list over the page: arrows, a number, or the name, then Enter. */
export function KindAsker(): React.JSX.Element | null {
  const [asked, setAsked] = useState<{ current: string; answer: (kind: string | null) => void } | null>(null)
  const [row, setRow] = useState('')
  useEffect(() => {
    const onAsk = (event: Event): void => {
      const detail = (event as CustomEvent).detail
      chime('open')
      setRow(CAPTURE_TYPES.find((type) => type.id === detail.current)?.label ?? '')
      setAsked(detail)
    }
    window.addEventListener('vigil:pick-kind', onAsk)
    return () => window.removeEventListener('vigil:pick-kind', onAsk)
  }, [])
  if (!asked) return null
  const done = (kind: string | null): void => {
    asked.answer(kind)
    setAsked(null)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[22vh]" onMouseDown={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label="Change kind" className="w-72 overflow-hidden rounded-xl bg-popover shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <Command
          value={row}
          onValueChange={(label) => {
            const at = CAPTURE_TYPES.findIndex((type) => type.label === label)
            if (at >= 0 && label !== row) step(at)
            setRow(label)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') return done(null)
            const picked = CAPTURE_TYPES[Number(event.key) - 1]
            if (!picked) return
            event.preventDefault()
            done(picked.id)
          }}
        >
          <CommandInput autoFocus placeholder="Change kind to…" />
          <CommandList>
            {CAPTURE_TYPES.map((type, index) => (
              <CommandItem key={type.id} value={type.label} onSelect={() => done(type.id)}>
                <type.icon style={{ color: type.tint }} />
                <span className="text-xs">{type.label}</span>
                {type.id === asked.current && <Check className="ml-auto size-4" />}
                <CommandShortcut className={type.id === asked.current ? 'ml-2' : ''}>{index + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </div>
    </div>
  )
}

// --- the fields a kind asks for

/** The fields this note's kind asks for, in the properties column. Nothing for a kind that asks for none. */
export function KindFields({ table, id, kind }: { table: NoteTable; id: string; kind: string }): React.JSX.Element | null {
  const fields = KIND_FIELDS[kind] ?? []
  const values = useLive(() => notes.fields(table, id), {} as Record<string, string | number>, [table, id])
  if (!fields.length) return null
  const save = (key: string, value: string | number | null): void => {
    if ((values[key] ?? null) === (value === '' ? null : value)) return
    void notes.setField(table, id, key, value === '' ? null : value).then(() => chime('noted'))
  }
  return (
    <>
      <PropLabel>{CAPTURE_TYPES.find((type) => type.id === kind)?.label ?? 'Kind'} details</PropLabel>
      {fields.map((field) => {
        const value = values[field.key]
        if (field.type === 'choice')
          return (
            <div key={field.key} className="flex items-center gap-2 px-2 py-1">
              <ListChecks className="size-4 shrink-0" />
              <Chips options={(field.options ?? []).map((option) => ({ id: option, label: option }))} on={(option) => value === option} pick={(option) => save(field.key, value === option ? null : option)} />
            </div>
          )
        if (field.type === 'rating')
          return (
            <div key={field.key} className="flex items-center gap-2 px-2 py-1.5" aria-label={`${field.label}: ${value ?? 'none'} of 5`}>
              <span className="w-12 text-meta">{field.label}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => (step(n - 1), save(field.key, value === n ? null : n))} className="text-muted-foreground hover:text-foreground">
                  <Star className="size-4" style={Number(value) >= n ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />
                </button>
              ))}
            </div>
          )
        if (field.type === 'long')
          return (
            <label key={`${id}-${field.key}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-within:bg-accent">
              <AlignLeft className="mt-1 size-4 shrink-0" />
              <Textarea rows={2} defaultValue={String(value ?? '')} placeholder={field.placeholder ?? field.label} onBlur={(event) => save(field.key, event.target.value.trim())}
                className="min-h-0 resize-none border-0 bg-transparent p-0 text-control text-foreground shadow-none focus-visible:ring-0" />
            </label>
          )
        return <PropInput key={`${id}-${field.key}`} icon={Type} value={String(value ?? '')} placeholder={field.placeholder ?? field.label} onSave={(text) => save(field.key, text)} />
      })}
    </>
  )
}

// --- versions

const whenSaved = (iso: string): string => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The versions a note has been, on a slider: drag back through them, read
 * the one you are on in place of the note, and bring it back if you want it.
 * `onShow` gets the words to show (and a key for them), or null for now.
 */
export function Versions({ table, id, onShow, onRestored }: {
  table: NoteTable
  id: string
  onShow: (body: unknown | null, key?: string) => void
  onRestored: () => void
}): React.JSX.Element {
  const [list, setList] = useState<Version[] | null>(null)
  const [at, setAt] = useState(0)
  const close = (): void => {
    setList(null)
    onShow(null)
  }
  const show = (versions: Version[], index: number): void => {
    setAt(index)
    void notes.version(versions[index].id).then((body) => onShow(body, `v${versions[index].id}`))
  }
  const open = (): void =>
    void notes.versions(id).then((found) => {
      if (!found.length) {
        chime('nope')
        return toast('No earlier versions yet: one is kept each time you come back to change it')
      }
      chime('open')
      setList(found)
      show(found, 0)
    })
  // ⌘K's "Version history" opens this one, when it is the note open.
  useEffect(() => {
    const onAsk = (event: Event): void => void ((event as CustomEvent).detail === id && open())
    window.addEventListener('vigil:versions', onAsk)
    return () => window.removeEventListener('vigil:versions', onAsk)
  })
  useEffect(() => close, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Escape is back to now, and only that: taken first, so the note stays open.
  useEffect(() => {
    if (!list) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      chime('fold')
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (!list)
    return (
      <Tip label="Earlier versions of this note, to read or bring back">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={open}><Clock3 className="size-3.5" /> Versions</Button>
      </Tip>
    )
  const version = list[at]
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
      {/* Oldest on the left, as time reads; the newest version is where it starts. */}
      <Slider className="w-32 shrink-0" min={0} max={Math.max(1, list.length - 1)} step={1} disabled={list.length < 2}
        value={[list.length - 1 - at]} onValueChange={([value]) => {
          const index = list.length - 1 - value
          if (index === at) return
          chime('page')
          show(list, index)
        }} />
      <span className="truncate tabular-nums"><Rolling text={whenSaved(version.savedAt)} by="word" /></span>
      <Button variant="ghost" size="sm" onClick={() => void notes.restore(table, id, version.id).then((undo) => {
        if (undo === null) return
        chime('rewind')
        close()
        onRestored()
        toast(`Brought back the version from ${whenSaved(version.savedAt)}`, () => void notes.restore(table, id, undo).then(onRestored))
      })}>Restore</Button>
      <Tip label="Back to now  Esc">
        <Button variant="ghost" size="icon-sm" aria-label="Back to now" onClick={() => (chime('fold'), close())}><X className="size-3.5" /></Button>
      </Tip>
    </div>
  )
}

// --- the map of a note's links

const W = 232
const H = 176
/**
 * The note in the middle, what it links to and what links to it around it:
 * one step each way, never the whole graph. Out to the right half, in to the
 * left, so the direction reads at a glance; a click opens one.
 */
export function LocalGraph({ id, title, onOpen }: { id: string; title: string; onOpen?: (type: string, id: string) => void }): React.JSX.Element | null {
  const [graph, setGraph] = useState<{ out: GraphNode[]; in: GraphNode[] } | null>(null)
  useEffect(() => {
    const load = (): void => void notes.graph(id).then(setGraph)
    load()
    // After things settle, not on every keystroke of an autosave: the links
    // are read from every note's words.
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = window.api.captures.onChange(() => {
      clearTimeout(timer)
      timer = setTimeout(load, 1500)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [id])
  if (!graph) return null
  const both = new Set(graph.out.filter((one) => graph.in.some((other) => other.id === one.id)).map((one) => one.id))
  const nodes = [
    ...graph.out.map((node) => ({ ...node, way: both.has(node.id) ? 'both' : 'out' })),
    ...graph.in.filter((node) => !both.has(node.id)).map((node) => ({ ...node, way: 'in' }))
  ]
  const more = Math.max(0, nodes.length - 10)
  const shown = nodes.slice(0, 10)
  const cx = W / 2
  const cy = H / 2
  // Out on the right, in on the left, each spread down its own half.
  const place = (way: string, index: number, count: number): [number, number] => {
    const angle = (way === 'in' ? Math.PI : 0) + (count === 1 ? 0 : ((index / (count - 1)) - 0.5) * Math.PI * 0.8) * (way === 'in' ? -1 : 1)
    return [cx + Math.cos(angle) * 72, cy + Math.sin(angle) * 62]
  }
  const sides = { in: shown.filter((node) => node.way === 'in'), out: shown.filter((node) => node.way !== 'in') }
  const short = (text: string): string => (text.length > 16 ? `${text.slice(0, 15)}…` : text) || 'Untitled'
  return (
    <>
      <PropLabel>Links</PropLabel>
      {!shown.length ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground"><Typed text="No links yet. Type @ in the note to link another, and it shows here." step={25} /></p>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto overflow-visible" role="img" aria-label={`${graph.out.length} links out, ${graph.in.length} in`}>
          <defs>
            <marker id="mf-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
            </marker>
          </defs>
          {(['out', 'in'] as const).flatMap((side) =>
            sides[side].map((node, index) => {
              const [x, y] = place(side, index, sides[side].length)
              const out = node.way !== 'in'
              return (
                <motion.g key={node.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.04, duration: 0.25 }}
                  style={{ transformOrigin: `${x}px ${y}px`, cursor: onOpen ? 'pointer' : undefined }}
                  onClick={() => onOpen && (chime('tap'), onOpen(node.type, node.id))}>
                  <title>{`${out ? (node.way === 'both' ? 'Links both ways: ' : 'Links to: ') : 'Linked from: '}${node.title || 'Untitled'}`}</title>
                  <line x1={out ? cx + 7 : x + 5} y1={out ? cy : y} x2={out ? x - 5 : cx - 7} y2={out ? y : cy}
                    className={out ? 'text-[var(--tt-brand-color-400)]' : 'text-muted-foreground'} stroke="currentColor" strokeWidth={1}
                    markerEnd="url(#mf-arrow)" markerStart={node.way === 'both' ? 'url(#mf-arrow)' : undefined} />
                  <circle cx={x} cy={y} r={4.5} className="fill-accent stroke-muted-foreground" strokeWidth={1} />
                  <text x={x} y={y + 15} textAnchor="middle" className={`fill-muted-foreground text-[10px] ${node.private ? 'private-text' : ''}`}>{short(node.title)}</text>
                </motion.g>
              )
            })
          )}
          <circle cx={cx} cy={cy} r={7} className="fill-[var(--tt-brand-color-400)]" />
          <text x={cx} y={cy - 12} textAnchor="middle" className="fill-foreground text-[10px] font-medium">{short(title)}</text>
        </svg>
      )}
      {more > 0 && <p className="px-2 text-xs text-muted-foreground">and <Rolling text={more} /> more, under Linked from</p>}
    </>
  )
}
