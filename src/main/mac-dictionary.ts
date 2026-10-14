import { execFile } from 'child_process'

/**
 * The Mac's own Dictionary, the one Look Up and the Dictionary app read:
 * asked through Dictionary Services (DCSCopyTextDefinition), so it works
 * offline, answers in a fraction of a second, knows plurals and other forms
 * ("running", "groceries"), places and people, and any other language the
 * person has turned on in Dictionary. Its entry comes back as one long line,
 * read here into the parts the box shows.
 */

export type MacEntry = { word: string; phonetic: string; part: string; definition: string; example: string; also: string }

// JavaScript for Automation: the word arrives as an argument, never as code.
const SCRIPT = `ObjC.import('CoreServices')
function run(argv) {
  const word = argv[0]
  const found = $.DCSCopyTextDefinition(null, $(word), $.CFRangeMake(0, word.length))
  return found ? String(ObjC.castRefToObject(found).js) : ''
}`

/** The Dictionary's whole entry for a word, or '' when it has none (or this is not a Mac). */
export const macLookUp = (word: string): Promise<string> =>
  process.platform !== 'darwin'
    ? Promise.resolve('')
    : new Promise((done) => execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT, word], { timeout: 4000 }, (error, out) => done(error ? '' : out.trim())))

const PARTS = ['plural noun', 'modal verb', 'auxiliary verb', 'combining form', 'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'exclamation', 'determiner', 'predeterminer', 'prefix', 'suffix', 'abbreviation', 'symbol', 'contraction', 'number']
const PART = new RegExp(`^(${PARTS.join('|')})\\b\\s*`)
// Where one sense stops: the next sense, a sub-sense, another part of speech, or the notes after.
const STOP = new RegExp(`\\s(?:\\d{1,2}\\s(?=[a-z(\\[])|•|\\||ORIGIN\\b|DERIVATIVES\\b|PHRASES\\b|PHRASAL VERBS\\b|USAGE\\b)|(?<=\\.)\\s(?:${PARTS.join('|')})\\s(?=[a-z[(\\d])`)
// Grammar notes before a sense: [mass noun], [with object], (plural groceries), a sense number.
const LEAD = /^(?:\[[^\]]*\]\s*|\(plural [^)]*\)\s*|\d{1,2}\s+)+/

const sentence = (text: string): string => {
  const line = text.replace(/\s+/g, ' ').trim().replace(/[\s:;,.]+$/, '')
  return line ? line.charAt(0).toUpperCase() + line.slice(1) + '.' : ''
}

/** One sense: its meaning, and the example after its colon. A long one is cut at a sentence or a semicolon. */
function sense(text: string): { definition: string; example: string } {
  const body = text.replace(LEAD, '')
  const end = body.search(STOP)
  const one = end < 0 ? body : body.slice(0, end)
  const colon = one.indexOf(': ')
  let definition = colon < 0 ? one : one.slice(0, colon)
  const example = colon < 0 ? '' : one.slice(colon + 2).split(/\s\|\s/)[0].replace(/[\s.]+$/, '').trim()
  // An entry for a place or a person runs on: its first sentence, and before a semicolon if still long.
  const stop = definition.search(/\.\s+[A-Z]/)
  if (stop > 0) definition = definition.slice(0, stop)
  if (definition.length > 80 && definition.includes('; ')) definition = definition.slice(0, definition.indexOf('; '))
  return { definition: sentence(definition), example }
}

/** The Dictionary's line read into its parts, or null when it holds no meaning. */
export function readMac(text: string): MacEntry | null {
  // Another spelling's own sound in brackets, "(über- | ˈyːbə |)", is left out: it would read as the sense.
  const line = text.replace(/\s+/g, ' ').replace(/\s\([^()|]*\|[^()]*\)/g, '').trim()
  if (!line) return null
  const said = /^(.+?) \| (.+?) \| (.*)$/.exec(line)
  const head = said ? said[1] : (line.match(new RegExp(`^(.+?)\\s(?=${PARTS.join('|')}\\b)`))?.[1] ?? line.split(' ')[0])
  let rest = said ? said[3] : line.slice(head.length).trim()
  const word = head.replace(/\s+\d+$/, '').replace(/,.*$/, '').trim()
  const phonetic = said ? said[2].split(/,\s*/)[0].trim() : ''
  const part = PART.exec(rest)?.[1] ?? ''
  rest = rest.slice(part ? PART.exec(rest)![0].length : 0)
  const first = sense(rest)
  if (!first.definition) return null
  // A second sense, when the entry numbers them: "1 … 2 …".
  const second = /^(?:\[[^\]]*\]\s*)*1\s/.test(rest) ? / 2 (?=[a-z(\[])/.exec(rest) : null
  const also = second ? sense(rest.slice(second.index + 3)).definition : ''
  return { word, phonetic, part, ...first, also: also !== first.definition ? also : '' }
}
