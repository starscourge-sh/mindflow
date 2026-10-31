/**
 * Talk to type's words as they should be written: spoken punctuation ("full
 * stop", "comma", "new line") turned into marks, a capital at each new
 * sentence, and a space before them when the caret follows a word. Apple adds
 * its own full stops and capitals where the Mac can; this makes the spoken
 * ones, and the join with what was there, right.
 */
const MARKS: [RegExp, string][] = [
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bnew line\b/gi, '\n'],
  [/\b(?:full stop|period)\b/gi, '.'],
  [/\bcomma\b/gi, ','],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation (?:mark|point)\b/gi, '!'],
  [/\bcolon\b/gi, ':'],
  [/\bsemicolon\b/gi, ';']
]

export function spoken(heard: string, before = ''): string {
  let text = heard
  for (const [said, mark] of MARKS) text = text.replace(said, mark)
  text = text
    // A mark Apple wrote as well as the spoken one ("full stop." becomes ".."), and no space before a mark.
    .replace(/[.,;:]*\s*([.,?!:;])[.,]*/g, '$1')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    // A space after a mark that has words after it.
    .replace(/([.,?!:;])(?=[^\s.,?!:;])/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/, '')
  // A capital at the start of each sentence and each line.
  text = text.replace(/([.?!]\s+|\n)([a-z])/g, (_all, gap: string, letter: string) => gap + letter.toUpperCase())
  const start = /(^|[.?!]\s*|\n\s*)$/.test(before)
  if (start) text = text.replace(/^[a-z]/, (letter) => letter.toUpperCase())
  // Mid-sentence, Apple's capital for a new utterance comes off (but never "I").
  else text = text.replace(/^([A-Z])(?=[a-z])/, (letter) => letter.toLowerCase())
  if (text && before && !/\s$/.test(before) && !/^[.,?!:;\n]/.test(text)) text = ` ${text}`
  return text
}
