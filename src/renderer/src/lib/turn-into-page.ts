import type { Editor, JSONContent } from '@tiptap/core'
import { chime } from './sound'
import { toast } from '@/components/haligtree/ui'
import { haligtree } from './haligtree'

/**
 * "Move to a new page": the words picked become a page of their own in Writing,
 * named by their first line, and a link to it is left where they were. A page,
 * as the button says: it was made as a note in the Inbox, so "page" was not
 * where it went (the tracker: "something fishy about it"). Words inside one line make a page of that
 * line's words; several lines make a page of those lines. ⌘Z in the note
 * puts the words back; the new page stays, as a page made by hand would.
 *
 * `embed`, "Share with a new page": the words leave for their own page but are
 * still drawn where they were, live (extensions/note-embed.ts): editing them
 * here edits the page, and the page can be shown anywhere else too.
 */
export async function turnIntoPage(editor: Editor, { embed = false }: { embed?: boolean } = {}): Promise<string | null> {
  const { state } = editor
  const { from, to, empty, $from, $to } = state.selection
  if (empty) return null
  const text = state.doc.textBetween(from, to, '\n').trim()
  if (!text) return null
  const slice = state.doc.slice(from, to)
  const inLine = $from.sameParent($to) && $from.parent.isTextblock
  const parts = (slice.content.toJSON() as JSONContent[] | null) ?? []
  const content: JSONContent[] = inLine ? [{ type: 'paragraph', content: parts }] : parts.filter((one) => one.type !== 'text')
  const title = text.split('\n')[0].replace(/[[\]|]+/g, ' ').trim().slice(0, 80)
  let id: string
  try {
    const body = { type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
    id = await haligtree.newArticle()
    await haligtree.saveItem(id, { title, body })
  } catch {
    chime('nope')
    toast('Could not make the page', undefined, 'error')
    return null
  }
  // Written in while the page was made: the words picked may have moved, so they stay and the page is only made.
  const doc = editor.isDestroyed ? null : editor.state.doc
  if (!doc || to > doc.content.size || doc.textBetween(from, to, '\n').trim() !== text) {
    chime('settled')
    toast('Made into a page; the words stay here, since the note changed meanwhile', undefined, 'success', undefined, { type: 'article', id, title })
    return id
  }
  const link = { type: 'noteLink', attrs: { id: `article:${id}`, label: title } }
  const shown = embed && !!editor.schema.nodes.noteEmbed
  editor.chain().focus().insertContentAt({ from, to }, shown ? { type: 'noteEmbed', attrs: { id: `article:${id}`, label: title } } : inLine ? link : { type: 'paragraph', content: [link] }).run()
  chime('settled')
  toast(shown ? 'Synced with a new page in Writing: edit it here or there, the same words' : 'Moved to a new page in Writing: the link takes you there', undefined, 'success', undefined, { type: 'article', id, title })
  return id
}
