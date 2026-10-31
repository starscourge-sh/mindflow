import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CAPTURE_TYPES } from '@/components/capture-kinds/capture-kind-picker'
import { notes, type MapNode, type NoteMap } from '@/lib/notes'
import { realMove } from '@/lib/real-move'
import { GraphCanvas, KIND_EMOJI, NOTE_TINT, REPLAY_FADE, kindOf, replayOrder, tintOf } from './graph-canvas'
import { useEmojiIcons } from '@/lib/icon-style'
import { haligtree, useLive, type Settings } from '@/lib/haligtree'
import { autoGroups, groupHue, hueTint, lookOf, shownMap, type MapLook } from '@/lib/map-look'
import { MapPanel } from './map-panel'
import { exampleMap } from '@/lib/examples'
import { Example } from './example'
import { chime } from '@/lib/sound'
import { FLOAT } from '@/lib/float'
import { Empty, Rolling, Tip, TypedMark } from './ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { History, Palette, Pause, Play, Search as SearchIcon, Unlink, X } from 'lucide-react'
import GearIcon from '@/components/ui/gear-icon'
import { AliveIcon } from '@/components/ui/alive-icon'
import { Slider } from '@/components/ui/slider'
import { still } from '@/lib/motion'
import { Fit } from '@/components/ui/icons'
import { Chips } from './display'
import { openSource, sources, type SourceGraph } from '@/lib/sources'
import { dayMonth, num } from '../../../../main/dates'

/**
 * Every note that links to another, as a dot, and every link as a line: the
 * shape of what you have joined up. Dots take their kind's colour and grow
 * with their links. Pointed at, a dot names itself and its neighbours light
 * up while the rest fades; clicked, it opens. Drag a dot, drag the space to
 * pan, pinch or ⌘-scroll to zoom. Notes with no links are left off.
 */
export function MapView({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element {
  const [mode, setMode] = useState<'links' | 'sources'>(() => {
    try {
      return localStorage.getItem('mapMode') === 'sources' ? 'sources' : 'links'
    } catch {
      return 'links'
    }
  })
  const pickMode = (next: string): void => {
    chime('tap')
    setMode(next as 'links' | 'sources')
    try {
      localStorage.setItem('mapMode', next)
    } catch {
      // Just for now, then.
    }
  }
  const modes = <Chips options={[{ id: 'links', label: 'Links' }, { id: 'sources', label: 'Sources' }]} on={(id) => id === mode} pick={pickMode} className="flex-nowrap" />
  if (mode === 'sources') return <SourceMap onOpen={onOpen} modes={modes} />
  return <LinkMap onOpen={onOpen} modes={modes} />
}

/**
 * The source-centred map: each person and source as a dot, every note from
 * them joined to it, and a person joined to the book they said it in.
 * Clicking a person or a source opens their page; a note opens itself.
 */
function SourceMap({ onOpen, modes }: { onOpen: (type: string, id: string) => void; modes: React.ReactNode }): React.JSX.Element {
  const graph = useLive(sources.graph, null as SourceGraph | null)
  const fit = useRef<() => void>(() => undefined)
  const people = graph?.nodes.filter((node) => node.type === 'source').length ?? 0
  return (
    <section data-map-mode="sources" className="relative flex min-w-0 flex-1 flex-col">
      <header className="@container flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <span className="shrink-0">{modes}</span>
        <span className="min-w-0 truncate whitespace-nowrap tabular-nums"><Rolling text={people} /> {people === 1 ? 'source' : 'people and sources'}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tip label="Fit the map">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
          </Tip>
        </div>
      </header>
      {graph && graph.nodes.length ? (
        <GraphCanvas map={graph} fit={fit} className="flex-1" onOpen={(type, id) => {
          const node = graph.nodes.find((one) => one.id === id)
          if (type === 'source' && node) return openSource(id.startsWith('who:') ? 'attribution' : 'medium', node.title)
          onOpen(type, id)
        }} />
      ) : graph ? (
        <div className="page-column">
          <Empty title="No sources yet">Give a note a who or a where, and the person or source shows up here as a dot, joined to everything from them.</Empty>
        </div>
      ) : null}
    </section>
  )
}

function LinkMap({ onOpen, modes }: { onOpen: (type: string, id: string) => void; modes: React.ReactNode }): React.JSX.Element {
  const real = useLive(notes.map, null as NoteMap | null)
  // No links yet: a made-up map of a few books shows what it draws, dimmed and out of reach.
  const example = !!real && !real.nodes.length
  const examples = useMemo(exampleMap, [])
  // The Map's own settings (the gear): kept in the library's settings, followed here at once as they change.
  const settings = useLive(haligtree.settings, null as Settings | null)
  const [look, setLook] = useState<MapLook | null>(null)
  const saved = settings ? lookOf(settings.mapLook as Partial<MapLook> | undefined) : null
  const now = look ?? saved ?? lookOf(null)
  const [panel, setPanel] = useState(false)
  const change = (patch: Partial<MapLook>, save = true): void => {
    const next = { ...now, ...patch }
    setLook(next)
    if (save) void haligtree.setSettings({ mapLook: next })
  }
  const map = useMemo(() => (example ? examples : real ? shownMap(real, now) : null), [example, examples, real, now.tags, now.files, now.pictures, now.hideLonely, now.search]) // eslint-disable-line react-hooks/exhaustive-deps
  // The colour groups as the panel shows them: the saved ones, or until one is edited the automatic tag colours.
  const groups = useMemo(() => now.groups ?? autoGroups(real?.nodes ?? []), [now.groups, real])
  const paint = useCallback((node: MapNode): string | undefined => {
    if (!now.groups) return undefined
    const hue = groupHue(node, now.groups)
    return hue ? hueTint(hue) : NOTE_TINT
  }, [now.groups])
  const canvasLook = useMemo(() => ({ names: now.names, dotSize: now.dotSize, lineSize: now.lineSize, arrows: now.arrows, centre: now.centre, push: now.push, linkPull: now.linkPull, linkLength: now.linkLength }),
    [now.names, now.dotSize, now.lineSize, now.arrows, now.centre, now.push, now.linkPull, now.linkLength])
  // A tag's dot opens its tag; a picture's, the note it is in.
  const open = (type: string, id: string): void => {
    if (type === 'tag') return onOpen('tag', id.slice(4))
    if (type === 'picture') {
      const from = map?.nodes.find((node) => node.id === id)?.from
      const note = [...(real?.nodes ?? []), ...(real?.lonely ?? [])].find((node) => node.id === from)
      return note ? onOpen(note.type, note.id) : undefined
    }
    onOpen(type, id)
  }
  const fit = useRef<() => void>(() => undefined)
  const fly = useRef<(id: string) => boolean>(() => false)
  const replay = useRef<(at: number | null) => void>(() => undefined)
  const [replaying, setReplaying] = useState(false)

  const emoji = useEmojiIcons()
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

  // Whether there is a map at all (the settings may still narrow it to nothing), and how many dots show.
  const count = (example ? examples.nodes.length : real?.nodes.length) ?? 0
  // Notes only: a tag's or a picture's dot is not a note.
  const dots = map?.nodes.filter((node) => node.type !== 'tag' && node.type !== 'picture').length ?? 0
  // A calm key, as a printed map's: two groups, each a short word then its marks, never broken across lines.
  // Wide, one quiet line with a hairline between the groups; in the "Key" popover, each group a small table.
  const legend = (stacked: boolean): React.JSX.Element => {
    const group = (label: string, items: React.ReactNode[]): React.JSX.Element => (
      <div data-map-key-group={label} className={stacked ? 'flex flex-col gap-1.5' : 'contents whitespace-nowrap'}>
        <span className="font-medium text-foreground/80">{label}</span>
        <div className={stacked ? 'grid grid-cols-2 gap-x-4 gap-y-1' : 'flex items-center gap-3'}>{items}</div>
      </div>
    )
    const tagItems = now.groups ? now.groups.filter((one) => one.query.trim()).slice(0, 6).map((one, n) => <span key={n} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: hueTint(one.colour) }} /><span className="truncate">{one.query}</span></span>) : [
      ...tags.map(([tag, { tint }]) => <span key={tag} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: tint }} /><span className="truncate">#{tag}</span></span>),
      ...(untagged ? [<span key=" none" className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: NOTE_TINT }} />No tag</span>] : [])
    ]
    const kindItems = kinds.map((type) => {
      const Icon = type.icon
      return <span key={type.id} className="flex items-center gap-1.5">{emoji && KIND_EMOJI[type.id] ? <span aria-hidden className="mf-emoji-icon text-[0.75rem] leading-none">{KIND_EMOJI[type.id]}</span> : <Icon className="size-3 shrink-0" />}{type.label}</span>
    })
    return (
      <>
        {group(now.groups ? 'Colour: group' : 'Colour: tag', tagItems)}
        {stacked && <span aria-hidden className="h-px bg-border" />}
        {group('Icon: kind', kindItems)}
      </>
    )
  }
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Like every page, the line goes when it has nothing to count. */}
      {count && !example ? <header className="@container flex h-10 shrink-0 items-center gap-2 border-b px-5 text-muted-foreground">
        <span className="shrink-0">{modes}</span>
        <span className="min-w-0 truncate whitespace-nowrap tabular-nums"><Rolling text={dots} /> {now.hideLonely ? 'linked ' : ''}{dots === 1 ? 'note' : 'notes'}</span>
        <span className="hidden whitespace-nowrap tabular-nums @2xl:inline">· <Rolling text={map!.edges.length} /> {map!.edges.length === 1 ? 'link' : 'links'}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tip label="Replay how the map grew">
            <Button data-map-replay variant="ghost" size="sm" aria-pressed={replaying} className={replaying ? 'bg-accent text-foreground' : ''}
              onClick={() => (chime(replaying ? 'off' : 'rewind'), setReplaying(!replaying))}>
              <History className="size-3.5" /><span className="hidden @xl:inline">Replay</span>
            </Button>
          </Tip>
          <FindOnMap nodes={map!.nodes} onPick={(id) => fly.current(id)} />
          <Tip label="Fit the map">
            <Button variant="ghost" size="icon-sm" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
          </Tip>
          <Tip label="Map settings">
            <Button data-map-settings variant="ghost" size="icon-sm" aria-pressed={panel} className={panel ? 'bg-accent text-foreground' : ''}
              onClick={() => (chime(panel ? 'fold' : 'open'), setPanel(!panel))}><AliveIcon icon={GearIcon} size={14} /></Button>
          </Tip>
        </div>
      </header> : null}
      {count ? (
        <Example on={example} flush className="min-h-0 flex-1" tryIt={<>type <TypedMark>@</TypedMark> in any note and pick another one. The two show up here as dots, joined by a line.</>}>
        {dots ? <GraphCanvas map={map!} onOpen={open} fit={fit} fly={fly} replay={replay} look={example ? undefined : canvasLook} paint={example ? undefined : paint} className="flex-1">
          {replaying && !example && <Replay nodes={map!.nodes} show={replay} onClose={() => (chime('off'), setReplaying(false))} />}
          {/* The map's foot, one row that never lays one part over another: the key on the left (folded into
              one "Key" button when the map is narrow), the notes left off on the right. */}
          <div data-map-foot className="@container/foot pointer-events-none absolute inset-x-4 bottom-3 flex items-end justify-between gap-3" style={panel && !example ? { right: 'calc(18rem + 1.5rem)' } : undefined}>
            {/* What the colours and icons mean: the colour is the tag, the icon the kind. */}
            <div data-map-key className="hidden min-w-0 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-1.5 text-meta text-muted-foreground @[52rem]/foot:grid">{legend(false)}</div>
            <Popover onOpenChange={(open) => open && chime('open')}>
              <PopoverTrigger asChild>
                <Button data-map-key-button variant="outline" className="pointer-events-auto h-10 gap-2 bg-background px-3 text-control dark:bg-background @[52rem]/foot:hidden">
                  <Palette className="size-4" />Key
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="flex w-72 flex-col gap-2.5 p-3 text-meta text-muted-foreground">{legend(true)}</PopoverContent>
            </Popover>
            {/* The notes left off, one click away: each opens, ready for an @ to put it on the map. */}
            {map!.alone && !example ? <Lonely count={map!.alone} notes={map!.lonely ?? []} onOpen={onOpen} /> : null}
          </div>
          {panel && !example && <MapPanel look={now} groups={groups} onChange={change} onClose={() => (chime('fold'), setPanel(false))} />}
        </GraphCanvas> : (
          // Narrowed to nothing by the settings: said so, with the panel still there to widen it.
          <div data-map-none className="relative flex flex-1 items-center justify-center text-muted-foreground">
            <p className="text-body">No notes on the map match {now.search.trim() ? <>“{now.search.trim()}”</> : 'these settings'}.</p>
            {panel && <MapPanel look={now} groups={groups} onChange={change} onClose={() => (chime('fold'), setPanel(false))} />}
          </div>
        )}
        </Example>
      ) : !map ? null : (
        <div className="page-column">
          <div className="px-5 pt-3">{modes}</div>
          <Empty title="No links yet">
            Type <TypedMark>@</TypedMark> in a note and pick another to link them. Every note you link shows up here as a dot, joined to the notes it points to.
          </Empty>
        </div>
      )}
    </section>
  )
}

const SPEEDS = [1, 2, 4]

/**
 * The Map grown again from the first note caught to the last: dots arrive in
 * the order they were caught, a link draws once both its ends are there, and
 * the date runs above. Play and pause, drag to any moment, pick a speed; Esc
 * or the close button shows the whole map again. With Motion off it opens on
 * the whole map, to be dragged through by hand.
 */
function Replay({ nodes, show, onClose }: { nodes: NoteMap['nodes']; show: React.RefObject<(at: number | null) => void>; onClose: () => void }): React.JSX.Element {
  const order = useMemo(() => replayOrder(nodes), [nodes])
  // The end: the last dot fully in.
  const end = order.length - 1 + REPLAY_FADE
  const [at, setAt] = useState(() => (still() ? end : 0))
  const [playing, setPlaying] = useState(() => !still())
  const [speed, setSpeed] = useState(1)
  const now = useRef(at)
  now.current = at
  // Each change of place drawn on the map, and again when the map's data reloads under it.
  useEffect(() => show.current(at), [show, at, nodes])
  useEffect(() => () => show.current(null), [show])
  // Played at an even pace of dots, not of days, so a quiet month does not stall it: a whole map over 4 to 20s.
  useEffect(() => {
    if (!playing) return
    const perDot = Math.min(20000, Math.max(4000, order.length * 60)) / end / speed
    let last = -1, frame = requestAnimationFrame(function step(time) {
      if (last < 0) last = time
      // A frame held up (the window away, the machine busy) carries on from where it was, never leaps ahead.
      const next = Math.min(end, now.current + Math.min(100, time - last) / perDot)
      last = time
      now.current = next
      setAt(next)
      if (next >= end) (setPlaying(false), chime('settled'))
      else frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, end, order.length])
  // Esc stops it, before anything else on the page hears the key.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      // The Map's settings panel, when open, is the layer on top: Esc closes it first.
      if (event.key !== 'Escape' || document.querySelector('[data-map-panel]')) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  const reached = order[Math.max(0, Math.min(order.length - 1, Math.floor(at)))]
  const shown = Math.min(order.length, Math.floor(at) + 1)
  const toggle = (): void => {
    chime('tap')
    if (playing) return setPlaying(false)
    // At the end, play starts again from the first note; with Motion off there is nothing to play, so it shows the end.
    if (still()) return setAt(end)
    if (at >= end) setAt(0)
    setPlaying(true)
  }
  return (
    <div data-map-replay-bar className="pointer-events-auto absolute top-3 left-1/2 flex w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-lg border bg-background py-1.5 pr-1.5 pl-2 text-control shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--mf-shadow-ink)_30%,transparent)]">
      <Tip label={playing ? 'Pause' : 'Play'}>
        <Button data-map-replay-play variant="ghost" size="icon-sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
      </Tip>
      {/* The date it has reached, the one thing to read, large and first; the count after it. */}
      <div className="flex w-36 shrink-0 flex-col leading-tight">
        <span data-map-replay-date className="font-semibold text-foreground tabular-nums">{reached?.at ? dayMonth(reached.at, 'always') : 'Undated'}</span>
        <span className="text-meta text-muted-foreground tabular-nums">{num(shown)} of {num(order.length)} notes</span>
      </div>
      <Slider aria-label="When" min={0} max={end} step={0.01} value={[at]} className="min-w-0 flex-1 cursor-pointer"
        onValueChange={([value]) => (setPlaying(false), setAt(value))} />
      <Tip label="Speed">
        <Button data-map-replay-speed variant="ghost" size="sm" className="w-10 shrink-0 tabular-nums"
          onClick={() => (chime('tap'), setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]))}>{speed}×</Button>
      </Tip>
      <Tip label="Stop the replay  Esc">
        <Button data-map-replay-close variant="ghost" size="icon-sm" onClick={onClose} aria-label="Stop the replay"><X className="size-3.5" /></Button>
      </Tip>
    </div>
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
      <label className="flex h-7 w-36 items-center @xl:w-52 gap-1.5 rounded-md bg-accent/60 px-2 text-control text-muted-foreground focus-within:bg-accent focus-within:text-foreground">
        <SearchIcon className="size-3.5 shrink-0" />
        <input data-map-find value={words} placeholder="Find a note" spellCheck={false}
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
        <ul className={`absolute top-full right-0 z-20 mt-1 w-72 rounded-lg p-1 text-control ${FLOAT}`}>
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
        {/* Said as what you could do next, not a pile left undone (notes wandering, not unlinked): the count large, the way in beside it. */}
        <Button data-map-lonely variant="outline" className="pointer-events-auto ml-auto h-10 min-w-0 shrink-0 gap-2 bg-background px-3 text-control dark:bg-background">
          <Unlink className="size-4" />
          <span className="text-lg leading-none font-semibold tabular-nums">{num(count)}</span>
          {/* Said in full where there is room; on a narrow map, the short way. */}
          <span className="hidden @[40rem]/foot:inline">{count === 1 ? 'note wandering on its own' : 'notes wandering on their own'}</span>
          <span className="@[40rem]/foot:hidden">{count === 1 ? 'on its own' : 'on their own'}</span>
          <span className="font-medium text-primary">Find them company</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 gap-0 p-0 text-control">
        <p className="border-b px-3 py-2 text-foreground">Open one and type <TypedMark>@</TypedMark> to link it to another note. Linked, it joins the map.</p>
        <ul className="max-h-72 overflow-y-auto p-1">
          {list.slice(0, 300).map((one) => {
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
          {count > Math.min(300, list.length) && <li className="px-2 py-1.5 text-muted-foreground">And {count - Math.min(300, list.length)} more. As you link these, the next ones show here.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
