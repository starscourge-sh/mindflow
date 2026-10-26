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
const focusPlugin = (focus: Exclude<Focus, 'off'>): Plugin => new Plugin({
  key: band,
  props: {
    attributes: { 'data-focus-band': focus },
    decorations: (state) => {
      const { $head } = state.selection
      if ($head.depth < 1) return null
      if (focus === 'paragraph') {
        const at = $head.before(1)
        const node = state.doc.nodeAt(at)
        return node ? DecorationSet.create(state.doc, [Decoration.node(at, at + node.nodeSize, { class: 'mf-in-focus' })]) : null
      }
      if (!$head.parent.isTextblock) return null
      // One character for each inline leaf, so offsets in the text are offsets in the block.
      const [from, to] = sentenceAt($head.parent.textBetween(0, $head.parent.content.size, undefined, '￼'), $head.parentOffset)
      return DecorationSet.create(state.doc, [Decoration.inline($head.start() + from, $head.start() + Math.max(from + 1, to), { class: 'mf-in-focus' })])
    }
  }
})

/** The focus band on this editor, as chosen. */
export function useFocusBand(editor: Editor | null): void {
  const focus = useFocus()
  useEffect(() => {
    if (!editor || editor.isDestroyed || focus === 'off') return
    editor.registerPlugin(focusPlugin(focus))
    return () => void (!editor.isDestroyed && editor.unregisterPlugin(band))
  }, [editor, focus])
}

const STOP = new Set('the and that this with from have were they them their there then than what when which while would could should about into your just like been some will said over also more only very much even well back after before because where being other those these here something nothing really still'.split(' '))
const NOT_ADVERBS = new Set('only early likely family reply apply supply july italy holy ugly friendly lonely lovely silly belly jelly fly rely ally bully daily weekly monthly yearly holly lily emily sally'.split(' '))
const quote = (word: string): string => `“${word}”`
const list = (words: string[]): string => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/** A short report on the prose, in plain sentences: reading time, long sentences, words used a lot, adverbs. */
export function proseReport(editor: Editor): string {
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
export const askAim = (): void => void window.dispatchEvent(new CustomEvent('haligtree:aim'))

/** The tools as rows for a page's own menu. */
export function writerMenu(editor: Editor | null, focus: Focus, report: (text: string) => void): { label: string; run: () => void }[] {
  return [
    ...(['sentence', 'paragraph'] as const).map((to) => ({ label: focus === to ? 'Focus off' : `Focus on the ${to}`, run: () => setFocus(focus === to ? 'off' : to) })),
    { label: 'Set a word aim', run: askAim },
    ...(editor ? [
      { label: 'Prose report', run: () => void fullReport(editor).then(report) },
      { label: 'Proofread', run: askProofread },
      { label: checkingLive() ? 'Stop checking as I write' : 'Check as I write', run: () => (setCheckingLive(!checkingLive()), chime(checkingLive() ? 'on' : 'off')) }
    ] : [])
  ]
}

/** The Prose report with what the grammar checker found folded in (it loads on first use). */
export const fullReport = (editor: Editor): Promise<string> => grammarSentence(editor.state.doc).then((line) => `${proseReport(editor)} ${line}`, () => proseReport(editor))

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
  const pick = 'rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground data-on:bg-accent data-on:text-foreground'
  return (
    <span data-writer-tools className="flex items-center gap-1">
      {report && <span data-prose-report className="absolute inset-x-0 bottom-full mx-auto mb-2 max-w-[40rem] px-6 text-center text-body text-foreground/80 text-pretty">{report}</span>}
      <span>Focus</span>
      {(['off', 'sentence', 'paragraph'] as const).map((to) => (
        <button key={to} type="button" data-focus={to} data-on={focus === to || undefined} className={pick} onClick={() => setFocus(to)}>
          {to === 'off' ? 'Off' : to === 'sentence' ? 'Sentence' : 'Paragraph'}
        </button>
      ))}
      <span aria-hidden className="mx-1">·</span>
      <button type="button" data-aim-ask className={pick} onClick={askAim}>Aim</button>
      <button type="button" data-report-ask data-on={!!report || undefined} className={pick} onClick={ask}>Prose report</button>
      {proof && (
        <>
          <button type="button" data-proofread-ask className={pick} onClick={() => (setReport(null), askProofread())}>Proofread</button>
          {live && <button type="button" data-grammar-live data-on={checking || undefined} className={pick} onClick={() => (setCheckingLive(!checking), setChecking(!checking), chime(checking ? 'off' : 'on'))}>Check as I write</button>}
        </>
      )}
      <span aria-hidden className="mx-1">·</span>
      <WritingSound />
    </span>
  )
}
