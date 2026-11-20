import { useMemo, useRef, useState } from 'react'

import { chime } from '@/lib/sound'
import { splitTags, useLive, haligtree } from '@/lib/haligtree'
import { quietTint } from '@/lib/map-look'
import type { MapNode } from '@/lib/notes'
import { Button } from '@/components/ui/button'
import { Maximize as Fit, Waypoints, X } from 'lucide-react'
import { kindOf, kindRank } from '@/components/capture-kinds/capture-kind-picker'
import type { CaptureMeta } from '../capture-list'
import { GraphCanvas, type Graph, type GraphNode } from './graph-canvas'
import { Chip, Chips } from './display'
import { Empty, Rolling, Tip, openTag } from './ui'
import { num, plural } from '../../../../main/dates'

type Mode = 'captures' | 'tags'
type Range = 'week' | 'month' | 'all'
const DAYS: Record<Range, number> = { week: 7, month: 31, all: Infinity }
/** The newest this many, so a big Inbox still settles quickly; the line under the map says so when there are more. */
const MOST = 400
/** The turn between one dot and the next in a sunflower's spiral, as d3's own layout starts its dots. */
const SPIRAL = Math.PI * (3 - Math.sqrt(5))

/**
 * How hard a capture or tag with no line is held near the middle. The Map's layout has no pull to the middle (its
 * notes are held by their links), and here those with no line were pushed out to the canvas's edges by all the rest,
 * the picture shrinking to fit them until every dot was a speck of a pixel or two. Held this gently, they ring the
 * tags' clusters, which keep the Map's own layout; a pull on every dot packed the clusters in among them.
 */
const HOLD = 0.15
/** What a capture is, for gathering the ones on their own: a meeting (recorded, or a calendar event's note), else its kind. */
const sortOf = (one: CaptureMeta): string => (one.source === 'Meeting' || one.medium === 'Meeting' ? 'meeting' : one.kind)
/** A capture on its own wears its kind's colour (a Note grey, a Term green, a Link blue), muted as a tag's is. */
const looseTint = (node: MapNode): string | undefined => (node.type === 'capture' && !node.tag ? quietTint(kindOf(node.kind).tint) : undefined)
/** What a dot's hover card counts: a tag's captures, a capture's shared tags, or that it stands on its own. */
const countOf = (node: GraphNode): string => (node.kind === 'tag' ? plural(node.links, 'capture') : node.tag ? plural(node.links, 'shared tag') : 'on its own')

const kept = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Applied, not kept.
  }
}

/**
 * What you have been capturing, as a map. Captures: every capture in the time
 * and the filter a dot, joined to the tags it shares with others (each such tag a
 * dot too), so what you keep coming back to gathers into clusters; the rest stand
 * on their own round them, like beside like. Tags: each tag a dot, joined to the
 * tags it turns up with, the line thicker the more captures carry both. Drawn by
 * the Map's own canvas.
 */
export function InboxGraph({ captures, onOpen, compact = false }: { captures: CaptureMeta[]; onOpen: (type: string, id: string) => void; compact?: boolean }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>(() => (kept('inboxGraph:mode', 'captures') === 'tags' ? 'tags' : 'captures'))
  const [range, setRange] = useState<Range>(() => (['week', 'month', 'all'].includes(kept('inboxGraph:range', 'month')) ? kept('inboxGraph:range', 'month') as Range : 'month'))
  const tagRows = useLive(haligtree.tags, [] as Awaited<ReturnType<typeof haligtree.tags>>)
  const fit = useRef<() => void>(() => undefined)
  // `drawn`: the captures on the map (the newest MOST of `inTime`); `sharing`: how many of them share a tag, and `hubs`
  // the tags they share; `tagged`: on the tag map, how many carry a tag at all.
  const graph = useMemo((): Graph & { drawn: number; inTime: number; sharing: number; hubs: string[]; tagged: number } => {
    const since = Date.now() - DAYS[range] * 86_400_000
    const colour = new Map(tagRows.map((one) => [one.tag, one.color ?? undefined]))
    const inTime = captures.filter((one) => new Date(one.capturedAt).getTime() >= since)
    // The newest, whatever order the list beside it is in (grouped by kind, or by name).
    const list = inTime.length > MOST ? [...inTime].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, MOST) : inTime
    const tagged = list.map((one) => ({ one, tags: [...new Set(splitTags(one.label, one.tagLine).tags.map((tag) => tag.toLowerCase()))] }))
    const count = new Map<string, number>()
    for (const { tags } of tagged) for (const tag of tags) count.set(tag, (count.get(tag) ?? 0) + 1)
    const said = { alone: 0, drawn: list.length, inTime: inTime.length }
    if (mode === 'tags') {
      const pairs = new Map<string, number>()
      for (const { tags } of tagged)
        for (let a = 0; a < tags.length; a++)
          for (let b = a + 1; b < tags.length; b++) {
            const key = [tags[a], tags[b]].sort().join(' ')
            pairs.set(key, (pairs.get(key) ?? 0) + 1)
          }
      return {
        ...said,
        // Bigger the more captures carry it: links stand for how often it is used.
        nodes: [...count].map(([tag, n]) => ({ type: 'tag', id: tag, title: `#${tag}`, kind: 'tag', links: n, tag, tint: colour.get(tag) })),
        edges: [...pairs].map(([key, n]) => [...key.split(' '), n] as [string, string, number]),
        sharing: 0,
        hubs: [],
        tagged: tagged.filter(({ tags }) => tags.length).length
      }
    }
    // Each tag shared by two or more captures is a dot of its own, and each capture is joined to its tags: a tag's
    // captures gather round it, so what you keep coming back to reads as a named cluster, and a capture with two tags
    // sits between them. Captures were joined to one another before, each to the next few under a tag, and a tag of
    // hundreds was a long string the layout folded into snakes and arcs, its lines crossing everywhere.
    const hubs = [...count].filter(([, n]) => n > 1)
    const joined = tagged.map(({ one, tags }) => ({ one, tags: tags.filter((tag) => count.get(tag)! > 1) }))
    const together = joined.filter(({ tags }) => tags.length)
    // Every other capture is a dot too, with no line: only a shared tag draws one, so a tag reads as the strong tie.
    // They were left off before, said only in grey under the map ("11 with no tag in common left off": 11 of 13).
    // Like gathers loosely by like (the meetings, the links, the terms): each sort starts in its own slice of a ring
    // round the clusters, and as the map settles they stay neighbours, in their kind's colour.
    const sorts = new Map<string, CaptureMeta[]>()
    for (const { one, tags } of joined) if (!tags.length) sorts.set(sortOf(one), [...(sorts.get(sortOf(one)) ?? []), one])
    const slices = [...sorts].sort(([a], [b]) => kindRank(a) - kindRank(b))
    const ring = 10 * Math.sqrt(hubs.length + together.length + 0.5) + 10 * Math.sqrt(Math.max(0, ...slices.map(([, some]) => some.length))) + 20
    const start = new Map<string, { x: number; y: number }>()
    slices.forEach(([, some], at) => {
      const turn = (2 * Math.PI * at) / slices.length - Math.PI / 2
      some.forEach((one, i) => {
        const out = 10 * Math.sqrt(i + 0.5)
        start.set(one.id, { x: Math.cos(turn) * ring + Math.cos(i * SPIRAL) * out, y: Math.sin(turn) * ring + Math.sin(i * SPIRAL) * out })
      })
    })
    // Every capture the size of one with a tag: a capture is a capture, joined or not.
    const dot = ({ one, tags }: (typeof joined)[number]): GraphNode => ({ type: 'capture', id: one.id, title: splitTags(one.label).text || one.label, kind: one.kind, links: Math.max(1, tags.length), tag: tags[0], tint: colour.get(tags[0]), private: !!one.private, ...start.get(one.id) })
    return {
      ...said,
      nodes: [
        ...hubs.map(([tag, n]) => ({ type: 'tag', id: tag, title: `#${tag}`, kind: 'tag', links: n, tag, tint: colour.get(tag) })),
        // The joined first, so the layout starts them in the middle; those on their own start on the ring.
        ...together.map(dot),
        ...joined.filter(({ tags }) => !tags.length).map(dot)
      ],
      edges: together.flatMap(({ one, tags }) => tags.map((tag) => [one.id, tag, 1] as [string, string, number])),
      sharing: together.length,
      hubs: hubs.map(([tag]) => tag),
      tagged: 0
    }
  }, [captures, mode, range, tagRows])
  // A tag clicked: the captures carrying it, listed under the map. A capture clicked opens, as a dot on every map does.
  const [picked, setPicked] = useState<{ title: string; ids: string[]; tag?: string } | null>(null)
  const pick = (type: string, id: string): void => {
    if (type !== 'tag') return onOpen('capture', id)
    setPicked({ title: `#${id}`, tag: id, ids: captures.filter((one) => splitTags(one.label, one.tagLine).tags.some((tag) => tag.toLowerCase() === id)).map((one) => one.id) })
  }
  const listed = picked ? captures.filter((one) => picked.ids.includes(one.id)) : []
  const capped = graph.inTime > graph.drawn
  // What is drawn, said in the Inbox's own words at its own size: how many captures, and what joins them.
  const said = mode === 'tags' ? (
    <>
      <strong className="font-semibold text-foreground"><Rolling text={graph.nodes.length} /> {graph.nodes.length === 1 ? 'tag' : 'tags'}</strong>
      , from {graph.tagged === graph.drawn ? `all ${num(graph.drawn)}` : `${num(graph.tagged)} of ${capped ? 'the newest ' : ''}${num(graph.drawn)}`} {graph.drawn === 1 ? 'capture' : 'captures'}
      {graph.tagged < graph.drawn && ` · the other ${num(graph.drawn - graph.tagged)} ${graph.drawn - graph.tagged === 1 ? 'has' : 'have'} no tag`}
    </>
  ) : (
    <>
      <strong className="font-semibold text-foreground"><Rolling text={graph.drawn} /> {graph.drawn === 1 ? 'capture' : 'captures'}</strong>
      {capped && `, the newest of ${num(graph.inTime)}`}
      {graph.drawn > 1 && (graph.sharing ? ` · ${num(graph.sharing)} share ${graph.hubs.length === 1 ? `#${graph.hubs[0]}` : `${num(graph.hubs.length)} tags`}` : ' · none share a tag')}
    </>
  )
  // Nothing in the time chosen: said, with the longer times to try.
  const when = range === 'week' ? 'this week' : range === 'month' ? 'this month' : 'yet'
  return (
    <section data-inbox-graph={mode} className={`relative flex min-h-0 flex-1 flex-col ${compact ? 'min-h-56' : 'min-h-80'}`}>
      {/* The choices wrap in their own group; Fit stays at the first line's right whatever the width. */}
      <div className="flex shrink-0 items-start gap-2 px-1 pb-1.5 text-control text-muted-foreground">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <Chips options={[{ id: 'captures', label: 'Captures', tip: 'Every capture a dot, gathered round the tags they share' }, { id: 'tags', label: 'Tags', tip: 'Tags joined by how often they come together' }]} on={(id) => id === mode}
          pick={(id) => (setMode(id as Mode), setPicked(null), keep('inboxGraph:mode', id))} className="flex-nowrap" />
        <Chips options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'all', label: 'All' }]} on={(id) => id === range}
          pick={(id) => (setRange(id as Range), setPicked(null), keep('inboxGraph:range', id))} className="flex-nowrap" />
        </div>
        <Tip label="Fit the map">
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Fit the map" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
        </Tip>
      </div>
      {graph.nodes.length ? (
        <>
          <GraphCanvas key={`${mode}-${range}`} map={graph} fit={fit} hold={HOLD} keepFit paint={looseTint} counts={countOf} className={`flex-1 rounded-lg border bg-accent/20 ${compact ? 'min-h-44' : 'min-h-64'}`} onOpen={pick} />
          {picked && (
            // As the Display menu draws a section (ui.tsx Island compact): the title row on the page's own ground, the
            // island under it holding only the rows.
            <div data-inbox-cluster className="mt-2 flex shrink-0 flex-col gap-1">
              <div className="flex items-center gap-2 px-1">
                <span className="min-w-0 truncate text-control font-semibold text-foreground">{picked.title}</span>
                <span className="shrink-0 text-control text-muted-foreground tabular-nums"><Rolling text={listed.length} /></span>
                {picked.tag && <button type="button" onClick={() => openTag(picked.tag!)} className="ml-auto shrink-0 rounded-md px-1.5 text-control font-medium text-(--mf-muted-strong) hover:bg-accent hover:text-foreground">Open the tag</button>}
                <Tip label="Close the list">
                  <button type="button" aria-label="Close the list" onClick={() => (chime('fold'), setPicked(null))} className={`${picked.tag ? '' : 'ml-auto'} flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground`}><X className="size-3.5" /></button>
                </Tip>
              </div>
              <ul className={`mf-island rounded-lg border bg-accent/25 p-1 ${compact ? 'max-h-28' : 'max-h-56'} overflow-y-auto`}>
                {listed.map((one) => (
                  <li key={one.id}>
                    <button type="button" data-cluster-row={one.id} data-private={one.private ? '' : undefined} onClick={() => onOpen('capture', one.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-control hover:bg-accent/60">
                      <span className="private-text min-w-0 flex-1 truncate">{splitTags(one.label).text || one.label || 'New note'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p data-inbox-graph-said className="px-1 pt-1.5 text-body text-(--mf-muted-strong)">{said}</p>
        </>
      ) : graph.drawn ? (
        <Empty compact={compact} title="No tags here yet">
          {graph.drawn === 1 ? 'This capture has no #tag yet.' : `None of these ${num(graph.drawn)} captures has a #tag yet.`} Give one a #tag and it shows here.
        </Empty>
      ) : (
        <Empty compact={compact} title={`Nothing captured ${when}`}>
          {range === 'all' ? 'What you capture shows here as dots.' : <>{captures.length === 1 ? 'Your capture is older.' : `Your ${num(captures.length)} captures are older.`} Try {range === 'week' && '“This month” or '}“All”.</>}
        </Empty>
      )}
    </section>
  )
}

/** Whether a list shows its graph in place of its rows, kept per list. */
export function useGraphShown(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => kept(`inboxGraph:on:${key}`, '') === 'on')
  return [on, (next) => (setOn(next), keep(`inboxGraph:on:${key}`, next ? 'on' : 'off'))]
}

/** "Graph", beside the Inbox's kinds: the list as a map of what you have been capturing, and back. */
export function GraphChip({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <Tip label={on ? 'Back to the list' : 'What you have been capturing, as a map: every capture a dot, gathered round the tags they share, and a tag graph'}>
      <span className="flex shrink-0">
        <Chip on={on} onClick={() => (chime(on ? 'fold' : 'open'), onChange(!on))} mark={<Waypoints aria-hidden className="size-3.5" />}>Graph</Chip>
      </span>
    </Tip>
  )
}
