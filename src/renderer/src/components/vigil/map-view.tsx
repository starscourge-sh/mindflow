import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { notes, type NoteMap } from '@/lib/notes'
import { realMove } from '@/lib/real-move'
import { GraphCanvas, NOTE_TINT, kindOf, tintOf } from './graph-canvas'
import { useLive } from '@/lib/vigil'
import { exampleMap } from '@/lib/examples'
import { Example } from './example'
import { chime } from '@/lib/sound'
import { Empty, Rolling, Tip } from './ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search as SearchIcon, Unlink } from 'lucide-react'
import { Fit } from '@/components/ui/icons'

/**
 * Every note that links to another, as a dot, and every link as a line: the
 * shape of what you have joined up. Dots take their kind's colour and grow
 * with their links. Pointed at, a dot names itself and its neighbours light
 * up while the rest fades; clicked, it opens. Drag a dot, drag the space to
 * pan, pinch or ⌘-scroll to zoom. Notes with no links are left off.
 */
export function MapView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const real = useLive(notes.map, null as NoteMap | null)
  // No links yet: a made-up map of a few books shows what it draws, dimmed and out of reach.
  const example = !!real && !real.nodes.length
  const examples = useMemo(exampleMap, [])
  const map = example ? examples : real
  const fit = useRef<() => void>(() => undefined)
  const fly = useRef<(id: string) => boolean>(() => false)

  // The tags that colour the map and the kinds on it, for the key in the corner.
  const { kinds, tags, untagged } = useMemo(() => {
    const seen = new Set<string>()
    const tagged = new Map<string, { count: number; tint: string }>()
    let untagged = false
    for (const node of map?.nodes ?? []) {
      seen.add(kindOf(node.kind)?.id ?? 'note')
      if (node.tag) tagged.set(node.tag, { count: (tagged.get(node.tag)?.count ?? 0) + 1, tint: tintOf(node) })
      else untagged = true
    }
    return { kinds: CAPTURE_TYPES.filter((type) => seen.has(type.id)), tags: [...tagged].sort((a, b) => b[1].count - a[1].count).slice(0, 6), untagged }
  }, [map])

  const count = map?.nodes.length ?? 0
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Like every page, the line goes when it has nothing to count. */}
      {count && !example ? <header className="flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> linked {count === 1 ? 'note' : 'notes'}</span>
        <span className="whitespace-nowrap tabular-nums">· <Rolling text={map!.edges.length} /> {map!.edges.length === 1 ? 'link' : 'links'}</span>
        <div className="ml-auto flex items-center gap-1">
          <FindOnMap nodes={map!.nodes} onPick={(id) => fly.current(id)} />
          <Tip label="Fit the map">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
          </Tip>
        </div>
      </header> : null}
      {count ? (
        <Example on={example} className="min-h-0 flex-1" tryIt="type @ in any note and pick another one. The two show up here as dots, joined by a line.">
        <GraphCanvas map={map!} onOpen={onOpen} fit={fit} fly={fly} className="flex-1">
          {/* What the colours and icons mean: the colour is the tag, the icon the kind. */}
          <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[calc(100%-18rem)] flex-col gap-1 rounded-lg bg-background px-2.5 py-1.5 text-meta text-muted-foreground">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="whitespace-nowrap text-foreground">Colour is the tag</span>
              {tags.map(([tag, { tint }]) => <span key={tag} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: tint }} />#{tag}</span>)}
              {untagged && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: NOTE_TINT }} />No tag</span>}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="whitespace-nowrap text-foreground">The icon is the kind</span>
              {kinds.map((type) => {
                const Icon = type.icon
                return <span key={type.id} className="flex items-center gap-1"><Icon className="size-3" />{type.label}</span>
              })}
            </div>
          </div>
          {/* The notes left off, one click away: each opens, ready for an @ to put it on the map. */}
          {map!.alone && !example ? <Lonely count={map!.alone} notes={map!.lonely ?? []} onOpen={onOpen} /> : null}
        </GraphCanvas>
        </Example>
      ) : !map ? null : (
        <div className="page-column">
          <Empty title="No links yet">
            Type @ in a note and pick another to link them. Every note you link shows up here as a dot, joined to the notes it points to.
          </Empty>
        </div>
      )}
    </section>
  )
}

/**
 * Find a note on the map by its name: the best few matches as you type, and
 * Enter (or a click) glides the map to it and lights it with its neighbours.
 */
function FindOnMap({ nodes, onPick }: { nodes: NoteMap['nodes']; onPick: (id: string) => boolean }): React.JSX.Element {
  const [words, setWords] = useState('')
  const [at, setAt] = useState(0)
  const [open, setOpen] = useState(false)
  const found = useMemo(() => {
    const want = words.trim().toLowerCase()
    if (!want) return []
    // Starts with the words first, then contains them; the busier note first within each.
    return nodes
      .map((node) => ({ node, where: node.title.toLowerCase().indexOf(want) }))
      .filter((one) => one.where >= 0)
      .sort((a, b) => Number(a.where > 0) - Number(b.where > 0) || a.node.title.length - b.node.title.length || b.node.links - a.node.links)
      .slice(0, 6)
      .map((one) => one.node)
  }, [nodes, words])
  const pick = (id: string | undefined): void => {
    if (!id) return
    onPick(id)
    setOpen(false)
  }
  return (
    <div className="relative">
      <label className="flex h-7 w-52 items-center gap-1.5 rounded-md bg-accent/60 px-2 text-control text-muted-foreground focus-within:bg-accent focus-within:text-foreground">
        <SearchIcon className="size-3.5 shrink-0" />
        <input data-map-find value={words} placeholder="Find a note on the map" spellCheck={false}
          onChange={(event) => (setWords(event.target.value), setAt(0), setOpen(true))}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setAt((n) => Math.max(0, Math.min(found.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1))))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (found.length) pick(found[at]?.id)
              else chime('nope')
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setWords('')
              event.currentTarget.blur()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      {open && words.trim() && (
        <ul className="absolute top-full right-0 z-20 mt-1 w-72 rounded-lg border bg-popover p-1 text-control text-popover-foreground shadow-[0_8px_24px_-10px_rgb(0_0_0/0.35)]">
          {found.length ? found.map((node, n) => {
            const Icon = (kindOf(node.kind) ?? CAPTURE_TYPES[0]).icon
            return (
              <li key={node.id}>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(node.id)} onMouseMove={(event) => realMove(event) && setAt(n)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${n === at ? 'bg-accent' : ''}`}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: tintOf(node) }} />
                  <span className="min-w-0 flex-1 truncate">{node.title || 'Untitled'}</span>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          }) : <li className="px-2 py-1.5 text-muted-foreground">No linked note is called that.</li>}
        </ul>
      )}
    </div>
  )
}

/**
 * The notes with no links, which the map leaves off: a button in the map's
 * corner that says how many, and opens the list of them. One clicked opens,
 * to be linked with an @.
 */
function Lonely({ count, notes: list, onOpen }: { count: number; notes: NonNullable<NoteMap['lonely']>; onOpen: (type: string, id: string) => void }): React.JSX.Element {
  return (
    <Popover onOpenChange={(open) => open && chime('open')}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="absolute right-4 bottom-3 gap-1.5 bg-background text-control dark:bg-background">
          <Unlink className="size-3.5" />
          {count} {count === 1 ? 'note has' : 'notes have'} no links
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 gap-0 p-0 text-control">
        <p className="border-b px-3 py-2 text-muted-foreground"><strong className="text-foreground">Left off the map.</strong> Open one and type @ to link it.</p>
        <ul className="max-h-72 overflow-y-auto p-1">
          {list.map((one) => {
            const kind = kindOf(one.kind) ?? CAPTURE_TYPES[0]
            const Icon = kind.icon
            return (
              <li key={one.id}>
                <button type="button" onClick={() => (chime('open'), onOpen(one.type, one.id))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent">
                  <Icon className="size-3.5 shrink-0" style={{ color: kind.tint }} />
                  <span className="min-w-0 flex-1 truncate">{one.title || 'Untitled'}</span>
                </button>
              </li>
            )
          })}
          {/* The rest are not a dead end: as these get linked, the next ones take their place. */}
          {count > list.length && <li className="px-2 py-1.5 text-muted-foreground">And {count - list.length} more. As you link these, the next ones show here.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
