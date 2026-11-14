import { useSyncExternalStore } from "react"

type Lowlight = ReturnType<typeof import("lowlight").createLowlight>
type Root = ReturnType<Lowlight["highlightAuto"]>

/**
 * The one set of highlighting grammars, shared by the extension that paints the
 * code and the picker that reports what it detected. Registering `common` twice
 * would be ~37 grammars of duplicate work.
 *
 * The grammars are a large piece of code most notes never need, so a window
 * fetches them the first time it meets a code block, not when it opens. Until
 * then a block reads as plain text and the label says nothing; every editor
 * is told once they arrive (`whenGrammars`) and paints its code then, a
 * moment later.
 */
let real: Lowlight | null = null
let loading: Promise<void> | null = null
const waiting = new Set<() => void>()

function loadGrammars(): Promise<void> {
  return (loading ??= import("lowlight").then(({ createLowlight, common }) => {
    real = createLowlight(common)
    for (const done of [...waiting]) done()
    waiting.clear()
  }))
}

/** Whether the grammars are in. */
export const grammarsIn = (): boolean => real !== null

/** The grammars fetched, if they are not in or on their way: a code block is about to be drawn. */
export const wantGrammars = (): void => void (real || loadGrammars())

/** Called once the grammars are in, unless they already were. Returns a way to stop waiting. */
export function whenGrammars(done: () => void): () => void {
  if (real) return () => undefined
  waiting.add(done)
  return () => void waiting.delete(done)
}

/** Whether the grammars are in, as React state: a label worked out before they came is worked out again. */
export const useGrammars = (): boolean =>
  useSyncExternalStore(
    (changed) => whenGrammars(changed),
    () => real !== null
  )

/** Code has its marks: brackets, braces, an equals or an arrow, a semicolon. Plain words and numbers have none. */
const looksLikeCode = (text: string): boolean => /[{}()[\];=<>]|=>|\$\w|^\s*#!|^\s*(def|import|from|class|function|const|let|var|return)\b/m.test(text)

/** Guesses already made, by the code guessed at. */
const guessed = new Map<string, Root>()

const NOTHING = { type: "root", children: [], data: { language: undefined, relevance: 0 } } as unknown as Root

/** What the code block extension asks of lowlight, answered by the real one once it is in. */
export const lowlight = {
  highlight: (...args: Parameters<Lowlight["highlight"]>) => (real ? real.highlight(...args) : (void loadGrammars(), NOTHING)),
  // Words with none of code's marks (a table of names and numbers pasted from a terminal) are not guessed at: such a
  // table was painted as Python, every apostrophe opening a string. Anything with code's brackets or signs is, as before.
  highlightAuto: (...args: Parameters<Lowlight["highlightAuto"]>) => {
    if (!real) return (void loadGrammars(), NOTHING)
    if (!looksLikeCode(args[0])) return { type: "root", children: [{ type: "text", value: args[0] }], data: { language: undefined, relevance: 0 } } as unknown as Root
    // Every grammar tried over the code is the costly part: a block's answer is kept, so a note of 17 blocks drawn
    // twice as it opens (and again as each is touched) guesses each once (11 Nov).
    const key = args[0]
    const had = guessed.get(key)
    if (had) return had
    const found = real.highlightAuto(...args)
    if (guessed.size > 300) guessed.delete(guessed.keys().next().value!)
    guessed.set(key, found)
    return found
  },
  listLanguages: (): string[] => real?.listLanguages() ?? [],
  registered: (name: string): boolean => real?.registered(name) ?? false,
}

/**
 * What language a snippet looks like, or "" when the guess is not worth showing.
 *
 * This gates the LABEL only; what is painted is lowlight.highlightAuto's
 * call (plain words are left unpainted there).
 *
 * The bar is high because the score does not separate right from wrong at the
 * low end. Measured on this grammar set: bash 16 (right), json 6 (right),
 * typescript 6 (right), python 5 (right), sql 5 (WRONG - vbnet), css 4 (right),
 * javascript 4 (WRONG - csharp). Anything under ~10 is a coin toss, so it is
 * reported as no answer rather than a confident wrong one.
 */
export function detectLanguage(code: string): string {
  // Scoring the whole block on every keystroke is wasted: the winner is settled
  // by the first couple of thousand characters.
  const { language, relevance } =
    lowlight.highlightAuto(code.slice(0, 2000)).data ?? {}
  return language && (relevance ?? 0) >= 10 ? language : ""
}
