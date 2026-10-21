import { useMemo, useRef, useState } from 'react'

import { chime } from '@/lib/sound'
import { splitTags, useLive, vigil } from '@/lib/vigil'
import { Button } from '@/components/ui/button'
import { Maximize as Fit, Waypoints } from 'lucide-react'
import type { CaptureMeta } from '../capture-list'
import { GraphCanvas, type Graph } from './graph-canvas'
import { Chip, Chips } from './display'
import { Empty, Rolling, Tip, openTag } from './ui'
import { num } from '../../../../main/dates'

type Mode = 'captures' | 'tags'
type Range = 'week' | 'month' | 'all'
const DAYS: Record<Range, number> = { week: 7, month: 31, all: Infinity }
/** Each capture is joined to at most this many others under one tag, the nearest in time: clusters, not a hairball. */
const NEIGHBOURS = 3
/** The newest this many, so a big Inbox still settles quickly. */
const MOST = 400

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
 * What you have been capturing, as a map. Captures: each a dot, joined to
 * others that share a tag, so what you keep coming back to gathers into
 * clusters. Tags: each tag a dot, joined to the tags it turns up with, the
 * line thicker the more captures carry both. Drawn by the Map's own canvas.
 */
export function InboxGraph({ captures, onOpen, compact = false }: { captures: CaptureMeta[]; onOpen: (type: string, id: string) => void; compact?: boolean }): React.JSX.Element {
  const [mode, setMode] = useState<Mode>(() => (kept('inboxGraph:mode', 'captures') === 'tags' ? 'tags' : 'captures'))
  const [range, setRange] = useState<Range>(() => (['week', 'month', 'all'].includes(kept('inboxGraph:range', 'month')) ? kept('inboxGraph:range', 'month') as Range : 'month'))
  const tagRows = useLive(vigil.tags, [] as Awaited<ReturnType<typeof vigil.tags>>)
  const fit = useRef<() => void>(() => undefined)
  const graph = useMemo((): Graph & { left: number } => {
    const since = Date.now() - DAYS[range] * 86_400_000
    const colour = new Map(tagRows.map((one) => [one.tag, one.color ?? undefined]))
    const list = captures.filter((one) => new Date(one.capturedAt).getTime() >= since).slice(0, MOST)
    const tagged = list.map((one) => ({ one, tags: splitTags(one.label).tags.map((tag) => tag.toLowerCase()) }))
    if (mode === 'tags') {
      const count = new Map<string, number>()
      const pairs = new Map<string, number>()
      for (const { tags } of tagged) {
        const unique = [...new Set(tags)]
        for (const tag of unique) count.set(tag, (count.get(tag) ?? 0) + 1)
        for (let a = 0; a < unique.length; a++)
          for (let b = a + 1; b < unique.length; b++) {
            const key = [unique[a], unique[b]].sort().join(' ')
            pairs.set(key, (pairs.get(key) ?? 0) + 1)
          }
      }
      return {
        // Bigger the more captures carry it: links stand for how often it is used.
        nodes: [...count].map(([tag, n]) => ({ type: 'tag', id: tag, title: `#${tag}`, kind: 'tag', links: n, tag, tint: colour.get(tag) })),
        edges: [...pairs].map(([key, n]) => [...key.split(' '), n] as [string, string, number]),
        alone: 0,
        left: tagged.filter(({ tags }) => !tags.length).length
      }
    }
    const byTag = new Map<string, number[]>()
    tagged.forEach(({ tags }, at) => {
      for (const tag of new Set(tags)) byTag.set(tag, [...(byTag.get(tag) ?? []), at])
    })
    const weight = new Map<string, number>()
    for (const members of byTag.values())
      // The list is newest first: each joined to the next few under the tag.
      members.forEach((at, n) => {
        for (const other of members.slice(n + 1, n + 1 + NEIGHBOURS)) {
          const key = `${Math.min(at, other)} ${Math.max(at, other)}`
          weight.set(key, (weight.get(key) ?? 0) + 1)
        }
      })
    const links = new Map<number, number>()
    for (const key of weight.keys()) for (const at of key.split(' ').map(Number)) links.set(at, (links.get(at) ?? 0) + 1)
    const shown = tagged.filter((_, at) => links.has(at))
    return {
      nodes: shown.map(({ one, tags }) => ({ type: 'capture', id: one.id, title: splitTags(one.label).text || one.label, kind: one.kind, links: links.get(tagged.findIndex((row) => row.one === one)) ?? 0, tag: tags[0], tint: tags[0] ? colour.get(tags[0]) : undefined, private: !!one.private })),
      edges: [...weight].map(([key, n]) => {
        const [a, b] = key.split(' ').map(Number)
        return [tagged[a].one.id, tagged[b].one.id, n] as [string, string, number]
      }),
      alone: 0,
      left: tagged.length - shown.length
    }
  }, [captures, mode, range, tagRows])
  const dots = graph.nodes.length
  return (
    <section data-inbox-graph={mode} className={`relative flex min-h-0 flex-1 flex-col ${compact ? 'min-h-56' : 'min-h-80'}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 pb-1.5 text-control text-muted-foreground">
        <Chips options={[{ id: 'captures', label: 'Captures', tip: 'Captures joined by the tags they share' }, { id: 'tags', label: 'Tags', tip: 'Tags joined by how often they come together' }]} on={(id) => id === mode}
          pick={(id) => (setMode(id as Mode), keep('inboxGraph:mode', id))} className="flex-nowrap" />
        <Chips options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }, { id: 'all', label: 'All' }]} on={(id) => id === range}
          pick={(id) => (setRange(id as Range), keep('inboxGraph:range', id))} className="flex-nowrap" />
        <Tip label="Fit the map">
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Fit the map" onClick={() => (chime('tap'), fit.current())}><Fit className="size-3.5" /></Button>
        </Tip>
      </div>
      {dots ? (
        <>
          <GraphCanvas key={`${mode}-${range}`} map={graph} fit={fit} className="min-h-0 flex-1 rounded-lg border bg-accent/20"
            onOpen={(type, id) => (type === 'tag' ? openTag(id) : onOpen(type, id))} />
          <p data-inbox-graph-said className="px-1 pt-1.5 text-control text-foreground/80">
            <Rolling text={dots} /> {mode === 'tags' ? (dots === 1 ? 'tag' : 'tags') : dots === 1 ? 'capture' : 'captures'}
            {graph.left > 0 && <span className="text-muted-foreground"> · {num(graph.left)} with {mode === 'tags' ? 'no tags' : 'no tag in common'} left off</span>}
          </p>
        </>
      ) : (
        <Empty compact={compact} title={mode === 'tags' ? 'No tags here yet' : 'Nothing shares a tag yet'}>
          {range === 'all' ? 'Tag a few captures with the same #word and they gather here.' : 'Nothing in this time shares a tag. Try a longer time, or All.'}
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
    <Tip label={on ? 'Back to the list' : 'What you have been capturing, as a map: clusters by shared tags, and a tag graph'}>
      <span className="flex shrink-0">
        <Chip on={on} onClick={() => (chime(on ? 'fold' : 'open'), onChange(!on))}><Waypoints aria-hidden className="size-3.5" />Graph</Chip>
      </span>
    </Tip>
  )
}
