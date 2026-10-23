import type { HaligtreeEditorProps } from './haligtree-editor'
import { TAGS } from '../haligtree'
import { PropertyStrip, keepPropertyLine } from './property-strip'
import { selectionActions } from './selection-actions'
import type { Origin } from './reword'
import { findCaptures, findHeadings, follow } from '@/lib/capture-links'

type NoteTable = 'captures' | 'nuggets'

/**
 * One set of editor powers for a note wherever it is written in: its page in
 * Pages, the note window, unlocked reading, the side pane. The selection bar
 * with Capture, Gem and the rest, the Properties block under the title, Name::
 * value lines, tags that open their page, @ and [[ links to notes and headings.
 * Each surface passes what it is and where a link goes; none turns a power
 * off on its own, so they cannot drift apart.
 *
 * `reading`: the note locked for reading. Nothing to edit, but words can
 * still be picked and kept as a capture or a gem (a reader keeps lines).
 */
export function notePowers({ table, id, kind, fields, text, origin, onOpen, reading = false, titled = false, created, updated }: {
  table: NoteTable
  id: string
  kind: string
  fields?: string | null
  text?: string
  /** Where words lifted out of it point back to. */
  origin: Origin
  /** Where a tag or a link leads: the tag's page, another note. */
  onOpen: (type: string, id: string, heading?: string) => void
  reading?: boolean
  /** Its title kept apart from its words (an article's title box): the Properties block opens the words. */
  titled?: boolean
  /** When it was made and last changed, shown read-only in the Properties block. */
  created?: string | null
  updated?: string | null
}): Partial<HaligtreeEditorProps> {
  return {
    host: window.api,
    tokens: TAGS,
    onTokenClick: (token) => token.name === 'tag' && onOpen('tag', token.value),
    toolbar: { fixed: false, selectionExtra: selectionActions(origin, { reading }) },
    readOnly: reading,
    documentId: `${table === 'captures' ? 'capture' : 'item'}-${id}`,
    // Locked, the page is words only; the block comes with the keys.
    belowTitle: reading ? undefined : <PropertyStrip table={table} id={id} kind={kind} fields={fields} text={text} created={created} updated={updated} />,
    stripFirst: titled,
    onPropertyLine: keepPropertyLine(table, id),
    findNotes: findCaptures,
    findHeadings,
    onOpenNote: (link, heading) => follow(link, (type, at) => onOpen(type, at), heading),
  }
}
