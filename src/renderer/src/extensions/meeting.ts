import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { MeetingView } from '@/components/haligtree/meeting-page'
import { foldMeeting, transcriptLines, type MeetingLine as Line } from '../../../main/meeting-doc'

/** A deliberate removal of a meeting (none in the app yet): a transaction with this meta may take one away. */
export const LET_GO = 'meeting-let-go'

/** The meetings in a document, with where each sits. */
function meetingsIn(doc: PMNode): { node: PMNode; pos: number }[] {
  const found: { node: PMNode; pos: number }[] = []
  doc.forEach((node, pos) => void (node.type.name === 'meeting' && found.push({ node, pos })))
  return found
}
/** A meeting's own mark, the same however its attributes change: when it began and its recording's start. */
const markOf = (node: PMNode): string => `${node.attrs.startedAt}|${node.attrs.at ?? ''}`

/**
 * A meeting recorded on this Mac (main/meeting.ts keeps it), as its own kind: the recording, every line said, the
 * moments, the voices' names and the action items are data on this one block, drawn by meeting-page.tsx. Nothing
 * typed can reach a time, a speaker or a line's edge: the block is one piece, and a key, a cut or a drop that would
 * take it away leaves it where it was (the rest of what was picked goes as asked). The words of a line change only
 * through "Fix this line". Copied or dragged out, it is plain quoted lines with their times as text.
 */
export const Meeting = Node.create({
  name: 'meeting',
  group: 'block',
  atom: true,
  // Picked by a click it would steal the press from the transcript's own text selection; ⌘A still reaches past it.
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      audio: { default: '' }, you: { default: '' }, others: { default: '' }, seconds: { default: 0 }, startedAt: { default: '' },
      event: { default: null }, people: { default: [] }, speakers: { default: [] }, names: { default: {} }, moments: { default: [] },
      found: { default: null }, take: { default: null }, words: { default: null }, tag: { default: '#recording' },
      /** Every line said: { id, who, at, end, text, marked }. */
      lines: { default: [] },
      /** The action items: { id, text, owner, date, at, done, task, by }. */
      actions: { default: [] },
      /** Until when anything was heard, in seconds: the quiet after it is said, not hidden. */
      heard: { default: null },
      /** An older recording read again as it opened (meeting-page.tsx): when, so it is read again only once, an Undo kept. */
      readAgain: { default: null },
      /** The folder it was recorded in (main/meeting.ts): it is never kept twice. */
      recording: { default: null },
      /** Why it ended by itself: 'crash' or 'disk'. Its page says so. */
      stopped: { default: null },
      /** Your microphone heard almost nothing while the others talked: its name ('' when not known), or null. */
      quietMic: { default: null }
    }
  },
  // Never read back from HTML: a meeting pasted or dropped from elsewhere arrives as its quoted lines (renderHTML's),
  // never as a second meeting holding nothing.
  parseHTML: () => [],
  renderHTML: ({ node, HTMLAttributes }) => {
    const said = transcriptLines((node.attrs.lines ?? []) as Line[], node.attrs.names ?? {})
    return ['div', mergeAttributes(HTMLAttributes, { 'data-meeting': '' }), ['blockquote', ...(said.length ? said.map((line) => ['p', line]) : [['p', 'A meeting']])]]
  },
  renderText: ({ node }) => transcriptLines((node.attrs.lines ?? []) as Line[], node.attrs.names ?? {}).join('\n'),
  addNodeView: () => ReactNodeViewRenderer(MeetingView, {
    // The transcript's own presses: text is picked and copied as text, a line double-clicked is fixed. The editor
    // never makes a press inside the meeting into picking the block.
    stopEvent: ({ event }) => !/^(copy|cut|paste|drop|dragover|dragenter|dragleave)$/.test(event.type)
  }),
  // Export as Markdown: the quoted lines, with their times and speakers.
  renderMarkdown: (node: { attrs?: Record<string, unknown> }) => {
    const said = transcriptLines(((node.attrs?.lines ?? []) as Line[]), (node.attrs?.names ?? {}) as Record<string, string>)
    return said.map((line) => `> ${line}`).join('\n>\n')
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('meetingWhole'),
        appendTransaction: (transactions: readonly Transaction[], before, after) => {
          if (!transactions.some((one) => one.docChanged)) return null
          // A meeting kept before it was its own kind: its lines folded into it, every word kept.
          if (after.doc.content.content.some((one) => one.type.name === 'meetingLine')) {
            const folded = foldMeeting(after.doc.toJSON())
            const tr = after.tr.replaceWith(0, after.doc.content.size, after.schema.nodeFromJSON(folded).content)
            return tr.setMeta('addToHistory', false)
          }
          if (transactions.some((one) => one.getMeta(LET_GO))) return null
          // A meeting a key, a cut or a drop took away is put back where it was: the rest of the change stands.
          const now = new Set(meetingsIn(after.doc).map((one) => markOf(one.node)))
          const lost = meetingsIn(before.doc).filter((one) => !now.has(markOf(one.node)))
          if (!lost.length) return null
          const tr = after.tr
          for (const { node, pos } of lost) {
            let at = pos
            for (const one of transactions) at = one.mapping.map(at, -1)
            at = tr.mapping.map(at, -1)
            const $at = tr.doc.resolve(Math.min(at, tr.doc.content.size))
            // Between blocks, never inside a line of text.
            const place = $at.depth ? $at.before(1) : $at.pos
            tr.insert(place, node)
          }
          return tr
        }
      })
    ]
  }
})

/**
 * A meeting's line as it was kept before 6 Nov (its words in the note itself): still read, so nothing kept that way
 * is lost, and folded at once into its meeting's own lines (the plugin above; main does the same for the whole book
 * when it opens).
 */
export const MeetingLine = Node.create({
  name: 'meetingLine',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return {
      who: { default: 'you', parseHTML: (element) => element.getAttribute('data-who') ?? 'you' },
      at: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-at') ?? 0) },
      end: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-end') ?? 0) },
      marked: { default: false, parseHTML: (element) => element.hasAttribute('data-marked') }
    }
  },
  parseHTML: () => [{ tag: 'p[data-meeting-line]' }],
  renderHTML: () => ['p', 0]
})

/** The line last right-clicked in a meeting's transcript, for the block menu's "Fix this line". */
let pointed: { id: string; until: number } | null = null
export const pointAtLine = (id: string | null): void => void (pointed = id ? { id, until: Date.now() + 60000 } : null)
export const lineUnderMenu = (): string | null => (pointed && Date.now() < pointed.until ? pointed.id : null)
