/**
 * A note renamed: every link to it written again with its new name. Links
 * are text in the note's words, so they read right here, in a backup and in
 * any other tool. Pure, so the tests can run it without a database.
 *
 * A link holds the note's id and the name it had (`noteLink`, `noteEmbed`),
 * or, typed and never followed, only the name (`[[Old name]]`). Both kinds
 * are rewritten; a link with words of its own (`[[Note|these words]]`) keeps
 * them, and a heading or a line it lands on stays as it was.
 */

type Doc = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Doc[]; [key: string]: unknown }

export interface Renamed {
  /** Every way a link names the note: `id` for a capture, `nugget:id` and the like for the rest. */
  ids: string[]
  from: string
  to: string
}

const same = (a: unknown, b: string): boolean => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase()
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The body with its links to the note renamed, and how many changed. The body given is never changed. */
export function renameLinks(body: unknown, { ids, from, to }: Renamed): { body: unknown; count: number } {
  const name = to.trim()
  if (!name || !from.trim() || same(from, name) && from.trim() === name) return { body, count: 0 }
  let count = 0
  if (typeof body === 'string') {
    // Markdown, as an import left it: `[[@id|name]]` and `[[@id#Heading|name]]` carry the id.
    let text = body.replace(/\[\[@([^|#\]]+)(#[^|\]]+)?\|([^\]]+)\]\]/g, (whole, id: string, heading = '', label: string) => {
      if (!ids.includes(id) || label === name) return whole
      count++
      return `[[@${id}${heading}|${name}]]`
    })
    // And by name alone: `[[Old]]`, `[[Old#Heading]]`, `[[Old|words]]`, `![[Old]]`.
    text = text.replace(new RegExp(`(!?)\\[\\[${escape(from.trim())}((?:#[^|\\]]+)?(?:\\|[^\\]]+)?)\\]\\]`, 'gi'), (_, bang: string, rest: string) => {
      count++
      return `${bang}[[${name}${rest}]]`
    })
    return { body: count ? text : body, count }
  }
  const walk = (node: Doc): Doc => {
    if (!node || typeof node !== 'object') return node
    let next = node
    if ((node.type === 'noteLink' || node.type === 'noteEmbed') && node.attrs) {
      const id = typeof node.attrs.id === 'string' ? node.attrs.id : ''
      const mine = id ? ids.includes(id) : same(node.attrs.label, from)
      if (mine && node.attrs.label !== name) {
        count++
        next = { ...node, attrs: { ...node.attrs, id: id || ids[0], label: name } }
      }
    }
    if (!next.content) return next
    const kids = next.content.map(walk)
    return kids.some((kid, at) => kid !== next.content![at]) ? { ...next, content: kids } : next
  }
  const out = body ? walk(body as Doc) : body
  return { body: count ? out : body, count }
}
