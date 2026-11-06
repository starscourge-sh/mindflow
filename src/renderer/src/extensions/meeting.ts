import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MeetingView } from '@/components/haligtree/meeting-page'
import { clock } from '@/components/haligtree/sound-player'

/** Who a line's voice is, as named on its meeting (the first meeting block in the note), else "You" or "Speaker 2". */
export function speakerOf(editor: Editor, who: string): string {
  if (who === 'you') return 'You'
  // The meeting block sits at the top: found in a step or two, never by walking an hour of lines for every line.
  const doc = editor.state.doc
  let names: Record<string, string> = {}
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i)
    if (node.type.name === 'meeting') { names = node.attrs.names ?? {}; break }
    if (node.type.name === 'meetingLine') break
  }
  return names[who] || `Speaker ${who.replace(/^s/, '')}`
}

/** Every line's name again, after a voice is named: one write to the page, no line redrawn. */
export function renameLines(editor: Editor): void {
  editor.view.dom.querySelectorAll<HTMLElement>('[data-meeting-line] [data-speaker]').forEach((el) => (el.textContent = speakerOf(editor, el.dataset.speaker ?? '')))
}

/**
 * A meeting recorded on this Mac (main/meeting.ts keeps it): the recording, who was there, the moments noted and
 * what to take from it, drawn by meeting-page.tsx. The words said follow it as `meetingLine`s.
 */
export const Meeting = Node.create({
  name: 'meeting',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    const json = (fallback: unknown) => ({
      default: fallback,
      parseHTML: (element: HTMLElement) => {
        try {
          return JSON.parse(element.getAttribute('data-meeting') ?? 'null')?.[0] ?? fallback
        } catch {
          return fallback
        }
      },
      rendered: false
    })
    return {
      audio: { default: '' }, you: { default: '' }, others: { default: '' }, seconds: { default: 0 }, startedAt: { default: '' },
      event: json(null), people: json([]), speakers: json([]), names: json({}), moments: json([]), found: json(null), take: json(null), words: { default: null }, tag: { default: '#meeting', rendered: false }
    }
  },
  parseHTML: () => [{ tag: 'div[data-meeting]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-meeting': '' })],
  addNodeView: () => ReactNodeViewRenderer(MeetingView)
})

/**
 * One line said in a meeting: its words, who said them (`who`: "you", or "s1", "s2"… for the others' voices) and when
 * (`at`, seconds in). The name and the time sit in a gutter before the words: the name opens "Who is this?", the time
 * plays the recording from there. A plain node view, so an hour of lines opens as fast as any long note.
 */
export const MeetingLine = Node.create({
  name: 'meetingLine',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      who: { default: 'you', parseHTML: (element) => element.getAttribute('data-who') ?? 'you' },
      at: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-at') ?? 0) },
      end: { default: 0, parseHTML: (element) => Number(element.getAttribute('data-end') ?? 0) },
      marked: { default: false, parseHTML: (element) => element.hasAttribute('data-marked') }
    }
  },
  parseHTML: () => [{ tag: 'p[data-meeting-line]' }],
  renderHTML: ({ node }) => ['p', { 'data-meeting-line': '', 'data-who': node.attrs.who, 'data-at': node.attrs.at, 'data-end': node.attrs.end, ...(node.attrs.marked ? { 'data-marked': '' } : {}) }, 0],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.dataset.meetingLine = ''
      dom.className = 'mf-meeting-line'
      const gutter = document.createElement('div')
      gutter.contentEditable = 'false'
      gutter.className = 'mf-meeting-gutter'
      const name = document.createElement('button')
      name.type = 'button'
      name.className = 'mf-meeting-name'
      const time = document.createElement('button')
      time.type = 'button'
      time.className = 'mf-meeting-time'
      gutter.append(name, time)
      const words = document.createElement('div')
      words.className = 'mf-meeting-words'
      dom.append(gutter, words)
      let now = node
      const draw = (): void => {
        dom.dataset.who = now.attrs.who
        dom.dataset.at = String(now.attrs.at)
        dom.toggleAttribute('data-marked', !!now.attrs.marked)
        name.dataset.speaker = now.attrs.who
        name.textContent = speakerOf(editor, now.attrs.who)
        name.title = now.attrs.who === 'you' ? '' : 'Who is this?'
        time.textContent = clock(Number(now.attrs.at))
        time.title = 'Play from here'
        // The name only where the voice changes, as a transcript reads.
        const at = typeof getPos === 'function' ? getPos() : undefined
        const before = at !== undefined && at > 0 ? editor.state.doc.resolve(at).nodeBefore : null
        dom.toggleAttribute('data-same', before?.type.name === 'meetingLine' && before.attrs.who === now.attrs.who)
      }
      draw()
      name.addEventListener('click', () => now.attrs.who !== 'you' && window.dispatchEvent(new CustomEvent('haligtree:meeting-name', { detail: { who: now.attrs.who, el: name } })))
      time.addEventListener('click', () => window.dispatchEvent(new CustomEvent('haligtree:meeting-seek', { detail: { at: Number(now.attrs.at), el: time } })))
      return {
        dom,
        contentDOM: words,
        update: (next) => {
          if (next.type !== now.type) return false
          now = next
          draw()
          return true
        },
        stopEvent: (event) => gutter.contains(event.target as Element),
        // The gutter, and the line's own light (data-found, from search), are the view's, never the document's.
        ignoreMutation: (mutation) => gutter.contains(mutation.target as Element) || (mutation.type === 'attributes' && mutation.target === dom)
      }
    }
  }
})
