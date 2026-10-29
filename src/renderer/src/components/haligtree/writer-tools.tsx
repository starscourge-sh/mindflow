import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { WritingSound } from './writing-sound'
import { askProofread, checkingLive, grammarSentence, setCheckingLive } from '@/lib/grammar'

/**
 * Writer's tools, as iA Writer and Scrivener have them: a focus band that
 * dims all but the sentence or paragraph you are on, an aim for the words
 * (word-aim.tsx: a thin line that fills, a soft chime at the aim), and a
 * short report on the prose in plain sentences. In the writing room's foot,
 * and in a piece of Writing's own menu.
 */

export type Focus = 'off' | 'sentence' | 'paragraph'
const FOCUS_KEY = 'writing-focus'
const readFocus = (): Focus => { try { const one = localStorage.getItem(FOCUS_KEY); return one === 'sentence' || one === 'paragraph' ? one : 'off' } catch { return 'off' } }
/** Off at first; the choice is kept for every page you write on. */
export const setFocus = (to: Focus): void => {
  try { localStorage.setItem(FOCUS_KEY, to) } catch { /* only a nicety */ }
  chime(to === 'off' ? 'off' : 'on')
  window.dispatchEvent(new CustomEvent('haligtree:focus-band'))
}
export function useFocus(): Focus {
  const [focus, set] = useState(readFocus)
  useEffect(() => {
    const changed = (): void => set(readFocus())
    window.addEventListener('haligtree:focus-band', changed)
    return () => window.removeEventListener('haligtree:focus-band', changed)
  }, [])
  return focus
}

const band = new PluginKey('focus-band')
/** The sentence around the caret in its line: from the last stop before it to the next one after. */
const sentenceAt = (text: string, at: number): [number, number] => {
  let from = 0
  for (const stop of text.slice(0, at).matchAll(/[.!?…]["'’”)]*\s+/g)) from = stop.index + stop[0].length
  const next = /[.!?…]["'’”)]*(\s|$)/.exec(text.slice(at))
  return [from, next ? at + next.index + next[0].trimEnd().length : text.length]
}
/**
 * What is lit: the sentence with the caret, or its block (a list item when it is in a list, else the whole block,
 * whatever kind: a heading, a code block, a quote, a table, a picture). Everything else is faded with opacity, never
 * a text colour: code blocks, headings and bold lead lines carry colours of their own and stayed bright under one.
 * Blocks wholly outside are faded whole; inside the block that holds the lit part, the words around it are faded,
 * and so are the list markers and pictures there.
 */
const focusPlugin = (focus: Exclude<Focus, 'off'>): Plugin => new Plugin({
  key: band,
  props: {
    attributes: { 'data-focus-band': focus },
    decorations: (state) => {
      const { doc } = state
      const { $head } = state.selection
      if ($head.depth < 1) return null
      const top = $head.before(1)
      const topNode = doc.nodeAt(top)
      if (!topNode) return null
      const topEnd = top + topNode.nodeSize
      let from = top
      let to = topEnd
      const lit: Decoration[] = []
      if (focus === 'sentence' && $head.parent.isTextblock) {
        // One character for each inline leaf, so offsets in the text are offsets in the block.
        const [a, z] = sentenceAt($head.parent.textBetween(0, $head.parent.content.size, undefined, '￼'), $head.parentOffset)
        from = $head.start() + a
        to = $head.start() + Math.max(a + 1, z)
        lit.push(Decoration.inline(from, to, { class: 'mf-in-focus' }))
      } else {
        // In a list, the item the caret is in; anywhere else, the block.
        for (let depth = $head.depth; depth > 1; depth--) {
          if (/item/i.test($head.node(depth).type.name)) { from = $head.before(depth); to = $head.after(depth); break }
        }
        lit.push(Decoration.node(from, to, { class: 'mf-in-focus' }))
      }
      const out: Decoration[] = []
      doc.forEach((node, at) => { if (at !== top) out.push(Decoration.node(at, at + node.nodeSize, { class: 'mf-out-focus' })) })
      if (from > top || to < topEnd) {
        for (const [a, z] of [[top + 1, from], [to, topEnd - 1]]) if (z > a) out.push(Decoration.inline(a, z, { class: 'mf-out-focus' }))
        topNode.descendants((node, offset) => {
          const at = top + 1 + offset
          const end = at + node.nodeSize
          if (end <= from || at >= to) {
            // A list item or a picture wholly outside the lit part: its marker or its image fades too.
            if (/item/i.test(node.type.name)) out.push(Decoration.node(at, end, { class: 'mf-out-marker' }))
            else if (node.isAtom && !node.isText) out.push(Decoration.node(at, end, { class: 'mf-out-focus' }))
          }
          return true
        })
      }
      return DecorationSet.create(doc, [...out, ...lit])
    }
  }
})

/** The focus band on this editor, as chosen, and only in the writing room (`on`): chosen there, it never dims a page read or written outside it. */
export function useFocusBand(editor: Editor | null, on: boolean): void {
  const focus = useFocus()
  useEffect(() => {
    if (!editor || editor.isDestroyed || focus === 'off' || !on) return
    editor.registerPlugin(focusPlugin(focus))
    return () => void (!editor.isDestroyed && editor.unregisterPlugin(band))
  }, [editor, focus, on])
}

const STOP = new Set('the and that this with from have were they them their there then than what when which while would could should about into your just like been some will said over also more only very much even well back after before because where being other those these here something nothing really still'.split(' '))
const NOT_ADVERBS = new Set('only early likely family reply apply supply july italy holy ugly friendly lonely lovely silly belly jelly fly rely ally bully daily weekly monthly yearly holly lily emily sally'.split(' '))
const quote = (word: string): string => `“${word}”`
const list = (words: string[]): string => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/** A short report on the prose, in plain sentences: reading time, long sentences, words used a lot, adverbs. */
function proseReport(editor: Editor): string {
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ')
  const words = text.match(/[\p{L}\p{M}'’]+/gu) ?? []
  if (!words.length) return 'Nothing written yet.'
  const minutes = Math.max(1, Math.round(words.length / 238))
  const out = [`${num(words.length)} words, about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to read.`]
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/).map((one) => (one.match(/[\p{L}\p{M}'’]+/gu) ?? []).length).filter(Boolean)
  const long = sentences.filter((n) => n > 30)
  out.push(long.length ? `${long.length === 1 ? 'One sentence runs' : `${num(long.length)} sentences run`} past 30 words; the longest has ${Math.max(...long)}.` : 'No sentence runs past 30 words.')
  const counts = new Map<string, number>()
  for (const word of words) { const one = word.toLowerCase(); if (one.length > 3 && !STOP.has(one)) counts.set(one, (counts.get(one) ?? 0) + 1) }
  const often = [...counts].filter(([, n]) => n >= Math.max(3, words.length / 150)).sort((a, b) => b[1] - a[1]).slice(0, 3)
  out.push(often.length ? `You come back to ${list(often.map(([word, n]) => `${quote(word)} ${n} times`))}.` : 'No word comes up too often.')
  const adverbs = [...new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length > 4 && word.endsWith('ly') && !NOT_ADVERBS.has(word)))]
  out.push(adverbs.length ? `${num(adverbs.length)} ${adverbs.length === 1 ? 'adverb' : 'adverbs'}: ${list(adverbs.slice(0, 5).map(quote))}${adverbs.length > 5 ? ' and more' : ''}.` : 'No adverbs ending in -ly.')
  return out.join(' ')
}

/** Ask for a word aim for the page in front (word-aim.tsx answers it). */
const askAim = (): void => void window.dispatchEvent(new CustomEvent('haligtree:aim'))

/** The tools as rows for a page's own menu. */
export function writerMenu(editor: Editor | null, report: (text: string) => void): { label: string; run: () => void }[] {
  return [
    // Focusing on a sentence or paragraph is the writing room's own: it is chosen there, where it shows.
    { label: 'Set a word aim', run: askAim },
    ...(editor ? [
      { label: 'How it reads', run: () => void fullReport(editor).then(report) },
      { label: 'Proofread', run: askProofread },
      { label: checkingLive() ? 'Stop marking mistakes as I write' : 'Mark mistakes as I write', run: () => (setCheckingLive(!checkingLive()), chime(checkingLive() ? 'on' : 'off')) }
    ] : [])
  ]
}

/** The Prose report with what the grammar checker found folded in (it loads on first use). */
const fullReport = (editor: Editor): Promise<string> => grammarSentence(editor.state.doc).then((line) => `${proseReport(editor)} ${line}`, () => proseReport(editor))

/** The tools in the writing room's foot: Focus (off, sentence, paragraph), Aim, and the report over the foot. */
export function WriterTools({ editor, proof = false, live = proof }: { editor: Editor | null; /** Proofread and the grammar line in the report: Writing and the Journal. */ proof?: boolean; /** "Check as I write" too: Writing only, so a day's pages are never marked up as they are written. */ live?: boolean }): React.JSX.Element {
  const focus = useFocus()
  const [report, setReport] = useState<string | null>(null)
  const [checking, setChecking] = useState(checkingLive)
  const ask = (): void => {
    if (report || !editor) return void (chime('fold'), setReport(null), editor?.commands.focus())
    chime('open')
    setReport(proseReport(editor))
    // The grammar line follows, once it is read through.
    if (proof) void fullReport(editor).then((full) => setReport((was) => (was ? full : was)))
    editor.commands.focus()
  }
  // Each tool a button you can see is one (a faint outline, darker words), so the plain words before them read as
  // their label: "Focus on the" blended in with "sentence" and "paragraph" when all three were the same grey words.
  const pick = 'cursor-pointer rounded-md border border-foreground/12 px-1.5 py-0.5 text-foreground/80 transition-colors hover:border-foreground/25 hover:text-foreground data-on:border-transparent data-on:bg-accent data-on:text-foreground'
  return (
    <span data-writer-tools className="flex items-center gap-1">
      {report && <span data-prose-report className="absolute inset-x-0 bottom-full mx-auto mb-2 max-w-[40rem] px-6 text-center text-body text-foreground/80 text-pretty">{report}</span>}
      {/* Each says what it does; pressed again, it is off. */}
      <span data-focus-label className="mr-0.5">Focus on the</span>
      {(['sentence', 'paragraph'] as const).map((to) => (
        <button key={to} type="button" data-focus={to} data-on={focus === to || undefined} aria-pressed={focus === to} className={pick} onClick={() => setFocus(focus === to ? 'off' : to)}>
          {to === 'sentence' ? 'sentence' : 'paragraph'}
        </button>
      ))}
      <span aria-hidden className="mx-1">·</span>
      <button type="button" data-aim-ask className={pick} onClick={askAim}>Word aim</button>
      <button type="button" data-report-ask data-on={!!report || undefined} className={pick} onClick={ask}>How it reads</button>
      {proof && (
        <>
          <button type="button" data-proofread-ask className={pick} onClick={() => (setReport(null), askProofread())}>Proofread</button>
          {live && <button type="button" data-grammar-live data-on={checking || undefined} className={pick} onClick={() => (setCheckingLive(!checking), setChecking(!checking), chime(checking ? 'off' : 'on'))}>Mark mistakes as I write</button>}
        </>
      )}
      <span aria-hidden className="mx-1">·</span>
      <WritingSound className={pick} />
    </span>
  )
}
