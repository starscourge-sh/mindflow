import { useMemo, useRef } from 'react'
import { alive } from '@/components/ui/alive-icon'
import ExpandIcon from '@/components/ui/expand-icon'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { notes, type NoteMap } from '@/lib/notes'
import { GraphCanvas, kindOf } from './graph-canvas'
import { useLive } from '@/lib/vigil'
import { exampleMap } from '@/lib/examples'
import { Example } from './example'
import { chime } from '@/lib/sound'
import { Empty, Rolling, Tip } from './ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Unlink } from 'lucide-react'

const Fit = alive(ExpandIcon)

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

  // Kinds on the map, for the key in the corner.
  const kinds = useMemo(() => {
    const seen = new Map<string, number>()
    for (const node of map?.nodes ?? []) seen.set(kindOf(node.kind)?.id ?? 'note', (seen.get(kindOf(node.kind)?.id ?? 'note') ?? 0) + 1)
    return CAPTURE_TYPES.filter((type) => seen.has(type.id))
  }, [map])

  const count = map?.nodes.length ?? 0
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Like every page, the line goes when it has nothing to count. */}
      {count && !example ? <header className="flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums"><Rolling text={count} /> linked {count === 1 ? 'note' : 'notes'}</span>
        <span className="whitespace-nowrap tabular-nums">· <Rolling text={map!.edges.length} /> {map!.edges.length === 1 ? 'link' : 'links'}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tip label="Fit the map">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
          </Tip>
        </div>
      </header> : null}
      {count ? (
        <Example on={example} className="min-h-0 flex-1" tryIt="type @ in any note and pick another one. The two show up here as dots, joined by a line.">
        <GraphCanvas map={map!} onOpen={onOpen} fit={fit} className="flex-1">
          {/* What each colour means, and what was left off. */}
          <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[calc(100%-18rem)] flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
            {kinds.map((type) => (
              <span key={type.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: type.tint }} />{type.label}</span>
            ))}
          </div>
          {/* The notes left off, one click away: each opens, ready for an @ to put it on the map. */}
          {map!.alone && !example ? <Lonely count={map!.alone} notes={map!.lonely ?? []} onOpen={onOpen} /> : null}
        </GraphCanvas>
        </Example>
      ) : !map ? null : (
        <div className="page-column">
          <Empty shape={['polygon', 2]} title="No links yet">
            Type @ in a note and pick another to link them. Every note you link shows up here as a dot, joined to the notes it points to.
          </Empty>
        </div>
      )}
    </section>
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
        <Button variant="outline" size="sm" className="absolute right-4 bottom-3 gap-1.5 bg-background text-control">
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
          {count > list.length && <li className="px-2 py-1.5 text-muted-foreground">and {count - list.length} more</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
