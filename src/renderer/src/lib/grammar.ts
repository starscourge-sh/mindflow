import type { Node as PMNode } from '@tiptap/pm/model'
import type { LocalLinter } from 'harper.js'

/**
 * Grammar and style, checked on this computer by Harper (harper.js, Apache-2.0):
 * its slim WebAssembly build, fetched from the app's own files the first time
 * it is asked for and never at startup. Nothing leaves the computer.
 * Spelling is left to the spellchecker the editor already has.
 */
let linter: Promise<LocalLinter> | null = null
/** How long the first load took, for the probes. */
export let loadedIn: number | null = null
export const grammarLoaded = (): boolean => loadedIn !== null
export function grammar(): Promise<LocalLinter> {
  return (linter ??= (async () => {
    const start = performance.now()
    const [{ LocalLinter }, { slimBinary }] = await Promise.all([import('harper.js'), import('harper.js/slimBinary')])
    const one = new LocalLinter({ binary: slimBinary })
    await one.setup()
    loadedIn = Math.round(performance.now() - start)
    ;(window as { qaGrammarLoad?: number }).qaGrammarLoad = loadedIn
    return one
  })())
}

/** One thing to look at: where it is in the document, what to put there, and why, in a few plain words. */
export type Finding = { from: number; to: number; text: string; replacement: string | null; reason: string; kind: string }

/** The reasons, plainer than Harper's categories. */
const REASONS: Record<string, string> = {
  Repetition: 'repeated word', Agreement: 'words that do not agree', Grammar: 'grammar', Punctuation: 'punctuation', Capitalization: 'capital letter',
  Readability: 'hard to read', Redundancy: 'says it twice', Style: 'style', WordChoice: 'word choice', Usage: 'usage', Typo: 'typo',
  Eggcorn: 'a mixed-up phrase', Malapropism: 'the wrong word', BoundaryError: 'words run together or split', Formatting: 'spacing',
  Enhancement: 'could be clearer', Nonstandard: 'nonstandard', Regionalism: 'regional word', WordOrder: 'word order', Miscellaneous: 'worth a look'
}
const reasonOf = (kind: string, message: string): string => (/passive/i.test(message) ? 'passive voice' : (REASONS[kind] ?? 'worth a look'))

/** The document as plain text, each block on its own line, and the way back from a place in the text to the document. */
function textOf(doc: PMNode): { text: string; at: (offset: number) => number } {
  let text = ''
  const marks: [number, number][] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (text) text += '\n\n'
      node.forEach((child, offset) => {
        marks.push([text.length, pos + 1 + offset])
        text += child.isText ? child.text! : '￼'
      })
      return false
    }
    return true
  })
  const at = (offset: number): number => {
    let found = marks[0] ?? [0, 0]
    for (const mark of marks) if (mark[0] <= offset) found = mark
    return found[1] + (offset - found[0])
  }
  return { text, at }
}

/** What Harper finds in a document, in order, spelling left out. */
export async function findings(doc: PMNode): Promise<Finding[]> {
  const { text, at } = textOf(doc)
  if (!text.trim()) return []
  const one = await grammar()
  const lints = await one.lint(text, { language: 'plaintext' })
  const out = lints.flatMap((lint): Finding[] => {
    const kind = lint.lint_kind()
    if (kind === 'Spelling') return []
    const span = lint.span()
    const suggestion = lint.suggestions()[0]
    const replacement = !suggestion ? null : suggestion.kind() === 1 ? '' : suggestion.kind() === 2 ? lint.get_problem_text() + suggestion.get_replacement_text() : suggestion.get_replacement_text()
    return [{ from: at(span.start), to: at(span.end), text: text.slice(span.start, span.end), replacement, reason: reasonOf(kind, lint.message()), kind }]
  })
  return out.sort((a, b) => a.from - b.from)
}

/** For the Prose report: what Harper found, in a sentence. */
export async function grammarSentence(doc: PMNode): Promise<string> {
  const found = await findings(doc)
  if (!found.length) return 'Grammar and style: nothing to look at.'
  const by = new Map<string, number>()
  for (const one of found) by.set(one.reason, (by.get(one.reason) ?? 0) + 1)
  const parts = [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => `${n} ${reason}`)
  return `Grammar and style: ${found.length} ${found.length === 1 ? 'thing' : 'things'} to look at (${parts.join(', ')}); Proofread goes through them.`
}

const LIVE = 'grammar-live'
/** "Check as I write": off at first, kept for every page of Writing. */
export const checkingLive = (): boolean => { try { return localStorage.getItem(LIVE) === '1' } catch { return false } }
export const setCheckingLive = (on: boolean): void => {
  try { localStorage.setItem(LIVE, on ? '1' : '0') } catch { /* only a nicety */ }
  window.dispatchEvent(new CustomEvent('haligtree:grammar-live'))
}
/** Proofread the page in front (proofread.tsx answers it, on a page of Writing only). */
export const askProofread = (): void => void window.dispatchEvent(new CustomEvent('haligtree:proofread'))
