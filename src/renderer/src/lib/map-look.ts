import type { MapEdge, MapNode, NoteMap } from './notes'

/**
 * The Map's own settings, behind the gear in its corner (as Obsidian's graph
 * view has): what it shows, its colour groups, how it looks and how it lays
 * out. Kept per library in its settings, as `mapLook`.
 */
export type MapGroup = { query: string; colour: string }
export type MapLook = {
  /** Each tag as a dot of its own, joined to every note that has it. */
  tags: boolean
  /** PDFs and web pages a note links to, as dots. */
  files: boolean
  /** Each picture in a note as a dot, joined to its note. */
  pictures: boolean
  /** Notes with no links left off (on), or shown as dots on their own (off). */
  hideLonely: boolean
  /** Only the notes whose name holds these words. */
  search: string
  /** Null until edited: then the automatic tag colours are used. */
  groups: MapGroup[] | null
  /** How big a dot must be on the screen, in pixels, before its name shows. */
  names: number
  dotSize: number
  lineSize: number
  arrows: boolean
  centre: number
  push: number
  linkPull: number
  linkLength: number
  /** Which sections are open. */
  open: Record<string, boolean>
}

export const MAP_LOOK: MapLook = {
  tags: false, files: true, pictures: false, hideLonely: true, search: '', groups: null,
  names: 12.3, dotSize: 0.5, lineSize: 0.3, arrows: true,
  centre: 0, push: 1, linkPull: 0.3, linkLength: 35,
  open: { filters: true, groups: true, look: true, layout: false }
}

/** The settings as saved, filled out with the defaults for anything not set. */
export const lookOf = (saved: Partial<MapLook> | null | undefined): MapLook => ({ ...MAP_LOOK, ...(saved ?? {}), open: { ...MAP_LOOK.open, ...(saved?.open ?? {}) } })

/** The theme's colours a group can take, as named on the page's tokens. */
export const MAP_HUES = ['purple', 'green', 'blue', 'orange', 'pink', 'red', 'yellow', 'brown', 'gray'] as const
/** A colour as a dot wears it: pulled toward the page's quiet ink so a map of hundreds stays calm. */
export const quietTint = (colour: string): string => `color-mix(in oklab, ${colour} 62%, var(--muted-foreground))`
/** A hue, by its name on the page's tokens, as a dot wears it. */
export const hueTint = (hue: string): string => quietTint(`var(--tt-color-text-${hue})`)

/** The groups the automatic colours make: one a tag, the commonest first. What the panel starts from. */
export const autoGroups = (nodes: MapNode[]): MapGroup[] => {
  const count = new Map<string, { n: number; colour: string }>()
  for (const node of nodes) if (node.tag && node.tint) count.set(node.tag, { n: (count.get(node.tag)?.n ?? 0) + 1, colour: node.tint })
  return [...count].sort((a, b) => b[1].n - a[1].n).map(([tag, { colour }]) => ({ query: `#${tag}`, colour }))
}

/** Whether a note is in a group: `#tag` by its tags, `kind:quote` by its kind, otherwise by words in its name. */
export const inGroup = (node: MapNode, query: string): boolean => {
  const want = query.trim().toLowerCase()
  if (!want) return false
  if (want.startsWith('#')) return (node.tags ?? (node.tag ? [node.tag] : [])).some((tag) => tag.toLowerCase() === want.slice(1))
  if (want.startsWith('kind:')) return node.kind.toLowerCase() === want.slice(5).trim()
  return node.title.toLowerCase().includes(want)
}

/**
 * The hue a note takes from the groups, or undefined for none. The group for
 * its own colour tag first, so the groups the panel starts from colour every
 * dot just as the automatic colours do; then the first group it is in.
 */
export const groupHue = (node: MapNode, groups: MapGroup[]): string | undefined =>
  (node.tag ? groups.find((group) => group.query.trim().toLowerCase() === `#${node.tag!.toLowerCase()}`) : undefined)?.colour ??
  groups.find((group) => inGroup(node, group.query))?.colour

const fileName = (url: string): string => url.slice(url.lastIndexOf('/') + 1)

/** The map as the settings show it: tags and pictures added as dots, files and lonely notes left off or on, narrowed by the search. */
export function shownMap(map: NoteMap, look: MapLook): NoteMap {
  let nodes: MapNode[] = [...map.nodes, ...(look.hideLonely ? [] : map.lonely ?? [])]
  let edges: MapEdge[] = [...map.edges]
  if (!look.files) {
    const files = new Set(nodes.filter((node) => node.type === 'pdf' || node.type === 'web').map((node) => node.id))
    nodes = nodes.filter((node) => !files.has(node.id))
    edges = edges.filter(([a, b]) => !files.has(a) && !files.has(b))
  }
  const words = look.search.trim().toLowerCase()
  if (words) {
    nodes = nodes.filter((node) => node.title.toLowerCase().includes(words))
    const kept = new Set(nodes.map((node) => node.id))
    edges = edges.filter(([a, b]) => kept.has(a) && kept.has(b))
  }
  const extra: MapNode[] = []
  if (look.tags) {
    const tints = new Map(map.nodes.filter((node) => node.tag).map((node) => [node.tag!, node.tint]))
    const seen = new Map<string, MapNode>()
    for (const node of nodes)
      for (const tag of node.tags ?? []) {
        const id = `tag:${tag}`
        if (!seen.has(id)) seen.set(id, { type: 'tag', id, title: `#${tag}`, kind: 'tag', links: 0, tag, tint: tints.get(tag), at: node.at })
        edges.push([node.id, id, 1, 1])
      }
    extra.push(...seen.values())
  }
  if (look.pictures) {
    const seen = new Map<string, MapNode>()
    for (const node of nodes)
      for (const url of node.pictures ?? []) {
        if (!seen.has(url)) seen.set(url, { type: 'picture', id: url, title: fileName(url), kind: 'picture', links: 0, picture: url, at: node.at, from: node.id })
        edges.push([node.id, url, 1, 1])
      }
    extra.push(...seen.values())
  }
  nodes = [...nodes, ...extra]
  // Each dot's links counted again, so its size says what is shown.
  const links = new Map<string, number>()
  for (const [a, b] of edges) (links.set(a, (links.get(a) ?? 0) + 1), links.set(b, (links.get(b) ?? 0) + 1))
  return { ...map, nodes: nodes.map((node) => (node.links === (links.get(node.id) ?? 0) ? node : { ...node, links: links.get(node.id) ?? 0 })), edges }
}
