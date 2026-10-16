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

const NOTHING = { type: "root", children: [], data: { language: undefined, relevance: 0 } } as unknown as Root

/** What the code block extension asks of lowlight, answered by the real one once it is in. */
export const lowlight = {
  highlight: (...args: Parameters<Lowlight["highlight"]>) => (real ? real.highlight(...args) : (void loadGrammars(), NOTHING)),
  highlightAuto: (...args: Parameters<Lowlight["highlightAuto"]>) => (real ? real.highlightAuto(...args) : (void loadGrammars(), NOTHING)),
  listLanguages: (): string[] => real?.listLanguages() ?? [],
  registered: (name: string): boolean => real?.registered(name) ?? false,
}

/**
 * What language a snippet looks like, or "" when the guess is not worth showing.
 *
 * This gates the LABEL only - the highlighting itself always uses the best
 * guess, which is the extension's own behaviour for an unset language.
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
