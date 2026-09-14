import { createLowlight, common } from "lowlight"

/**
 * The one set of highlighting grammars, shared by the extension that paints the
 * code and the picker that reports what it detected. Registering `common` twice
 * would be ~37 grammars of duplicate work.
 */
export const lowlight = createLowlight(common)

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
