import { tokens } from './likeness.ts'
import { nameFrom, nameOf, ordinary, withoutAddresses, writtenAsName } from './name-match.ts'

/**
 * Notes matched by the words they share, each word taken back to its root
 * (Apple's Natural Language lemmas: "running" is "run"), and a root that only
 * grows another ("stoic" in "stoicism", "photograph" in "photography") read as
 * the same. Rare shared roots count for more than common ones (TF-IDF). Apple's
 * sentence meaning is only ever a tie-break between two near-equal matches:
 * alone it scored "Is Paul the hero of Dune?" as close to a banana bread recipe
 * as to Herbert's words about Dune.
 *
 * Every offer made from it (Links suggest themselves, You already wrote this,
 * Which folder?, Tags from your own notes, A clue for your question, Notes at
 * the right moment) has a
 * threshold set on test/roots-bench.test.ts, 200 notes with known right
 * answers, and ships only where at least 4 in 5 of its offers are right.
 */

export type Lemmas = Record<string, string>
export type RootNote = { key: string; title: string; text: string; lemmas?: Lemmas }
type Vector = Map<string, number>

/** Roots that carry no subject: asking words and the commonest verbs, once taken back to their roots. */
const BARE = new Set('why how what where when which who whom whose should would could might must shall will can does do be have make made get go come say take let keep thing way want need use try seem look give find tell feel think know mean put set turn ask work show leave many much more most less very really just still even also yet about'.split(' '))

/** The roots of some words, in order, as Apple's lemmas give them (left as written where it gives none). */
export const rootsOf = (text: string, lemmas: Lemmas = {}): string[] => tokens(text).map((word) => (Object.hasOwn(lemmas, word) ? lemmas[word] : word)).filter((root) => !BARE.has(root))

/**
 * A name's or a field's root, past what Apple's lemmas leave: a capitalised
 * "Stoics" is left as written, and "stoicism", "stoicist" and "stoics" are one
 * subject. Only these endings, and only with four letters or more left.
 */
const ENDINGS = ['isms', 'ists', 'ism', 'ist', 'ies', 'es', 's']
export const ending = (root: string): string => {
  for (const one of ENDINGS) if (root.endsWith(one) && root.length - one.length >= 4 && !root.endsWith('ss')) return root.slice(0, -one.length) + (one === 'ies' ? 'y' : '')
  return root
}

export class RootIndex {
  readonly notes: RootNote[]
  private counts: Map<string, number>[] = []
  private df = new Map<string, number>()
  private fold = new Map<string, string>()
  private vectors: Vector[] = []
  private at = new Map<string, number>()
  private vocab = new Set<string>()

  /** The root a word is counted under: its ending taken off, then the shortest root in the book it only grows. */
  private keyOf(root: string): string {
    const kept = this.fold.get(root)
    if (kept) return kept
    const base = ending(root)
    if (base.length > 5)
      for (let cut = Math.max(5, base.length - 4); cut < base.length; cut++) {
        const short = base.slice(0, cut)
        if (this.vocab.has(short)) return ending(short)
      }
    return base
  }

  constructor(notes: RootNote[]) {
    this.notes = notes
    const raw = notes.map((note) => rootsOf(`${note.title} ${note.title} ${note.text}`, note.lemmas))
    // A root that is another plus a short ending ("stoicism" from "stoic") is read as that one.
    this.vocab = new Set(raw.flat())
    for (const root of this.vocab) {
      const key = this.keyOf(root)
      if (key !== root) this.fold.set(root, key)
    }
    this.counts = raw.map((roots) => this.tf(roots))
    for (const tf of this.counts) for (const root of tf.keys()) this.df.set(root, (this.df.get(root) ?? 0) + 1)
    this.vectors = this.counts.map((tf) => this.weigh(tf))
    notes.forEach((note, index) => this.at.set(note.key, index))
  }

  private tf(roots: string[]): Map<string, number> {
    const tf = new Map<string, number>()
    for (const root of roots) {
      const one = this.keyOf(root)
      tf.set(one, (tf.get(one) ?? 0) + 1)
    }
    return tf
  }

  /** How many notes hold a root. */
  notesWith(root: string): number {
    return this.df.get(this.keyOf(root)) ?? 0
  }

  /** How rare a root is across the book: a root in every note says nothing. */
  idf(root: string): number {
    return Math.log(1 + this.notes.length / (this.df.get(this.keyOf(root)) ?? 1))
  }

  private weigh(tf: Map<string, number>): Vector {
    const out: Vector = new Map()
    let size = 0
    for (const [root, n] of tf) {
      const weight = (1 + Math.log(n)) * this.idf(root)
      out.set(root, weight)
      size += weight * weight
    }
    size = Math.sqrt(size) || 1
    for (const [root, weight] of out) out.set(root, weight / size)
    return out
  }

  /** Some words, as the index weighs them. */
  vector(text: string, lemmas?: Lemmas): Vector {
    return this.weigh(this.tf(rootsOf(text, lemmas)))
  }

  vectorOf(key: string): Vector | null {
    const index = this.at.get(key)
    return index === undefined ? null : this.vectors[index]
  }

  /** The roots of words as this index folds them. */
  folded(text: string, lemmas?: Lemmas): string[] {
    return rootsOf(text, lemmas).map((root) => this.keyOf(root))
  }

  /** Every note scored against some words, best first, the note itself left out. */
  rank(vector: Vector, leave?: string): { key: string; score: number }[] {
    const out: { key: string; score: number }[] = []
    // The note itself is left out by its id, whatever its key says it is ("nugget:" or
    // "article:" before it): matched as a page against its own row it was offered as its
    // own copy, and "Open it" opened the note you were on.
    const own = leave?.slice(leave.indexOf(':') + 1)
    this.vectors.forEach((other, index) => {
      const key = this.notes[index].key
      if (leave && (key === leave || key.slice(key.indexOf(':') + 1) === own)) return
      out.push({ key, score: cosine(vector, other) })
    })
    return out.sort((a, b) => b.score - a.score)
  }
}

export function cosine(a: Vector, b: Vector): number {
  let score = 0
  const [small, big] = a.size < b.size ? [a, b] : [b, a]
  for (const [root, weight] of small) score += weight * (big.get(root) ?? 0)
  return score
}

/** Several vectors as one (a folder's notes): their sum, made unit length again. */
export function centroid(vectors: Vector[]): Vector {
  const out: Vector = new Map()
  for (const vector of vectors) for (const [root, weight] of vector) out.set(root, (out.get(root) ?? 0) + weight)
  const size = Math.sqrt([...out.values()].reduce((sum, one) => sum + one * one, 0)) || 1
  for (const [root, weight] of out) out.set(root, weight / size)
  return out
}

/**
 * Near-equal matches put in order by meaning (a tie-break, never more): two
 * within `close` of each other keep their places unless meaning says otherwise.
 */
export function tieBreak<T extends { score: number }>(ranked: T[], meaning: ((one: T) => number) | null, close = 0.02): T[] {
  if (!meaning || ranked.length < 2) return ranked
  return [...ranked].sort((a, b) => (Math.abs(a.score - b.score) <= close ? meaning(b) - meaning(a) : b.score - a.score))
}

// --- The offers, each with the threshold its bench set.

/** "You already wrote this": another note saying nearly the same. */
export const SAME = 0.5
/** "A clue for your question" and "Notes at the right moment": a note on the same subject. */
export const CLUE = 0.16
/** "Which folder?": the folder a loose note reads like, by this much more than the next. */
export const FOLDER = { score: 0.18, margin: 0.05 }

/**
 * Nearly the same: of each note's roots, at least this share are in the other, both ways. Two notes on one
 * subject share many roots; only a note written again shares nearly all of them.
 */
export const SAME_SHARE = 0.85

export function alreadyWrote(index: RootIndex, text: string, lemmas: Lemmas | undefined, leave: string, meaning: ((key: string) => number) | null = null): { key: string; score: number } | null {
  const mine = new Set(index.folded(text, lemmas))
  if (mine.size < 6) return null
  const ranked = tieBreak(index.rank(index.vector(text, lemmas), leave).slice(0, 5), meaning && ((one) => meaning(one.key)))
  return ranked.find((one) => {
    if (one.score < SAME) return false
    const note = index.notes.find((each) => each.key === one.key)!
    const theirs = new Set(index.folded(`${note.title} ${note.text}`, note.lemmas))
    const shared = [...mine].filter((root) => theirs.has(root)).length
    return shared / mine.size >= SAME_SHARE && shared / theirs.size >= SAME_SHARE
  }) ?? null
}

/**
 * Notes on what a question or an event is about. Asked in a few words, one shared word is chance ("Call with
 * the bank" and "Call Paul"), so a note must share two of its roots, or its only one.
 */
export function cluesFor(index: RootIndex, text: string, lemmas: Lemmas | undefined, leave?: string, meaning: ((key: string) => number) | null = null, n = 3): { key: string; score: number }[] {
  const asked = new Set(index.folded(text, lemmas))
  if (!asked.size) return []
  const enough = Math.min(2, asked.size)
  const shares = (key: string): boolean => {
    const note = index.notes.find((one) => one.key === key)!
    const theirs = new Set(index.folded(`${note.title} ${note.text}`, note.lemmas))
    return [...asked].filter((root) => theirs.has(root)).length >= enough
  }
  return tieBreak(index.rank(index.vector(text, lemmas), leave).slice(0, n + 4).filter((one) => one.score >= CLUE && shares(one.key)), meaning && ((one) => meaning(one.key))).slice(0, n)
}

/**
 * "Tags from your own notes": of the `of` notes most like it, those at least `score` alike are its nearest; a tag
 * is offered when `carry` of them or more carry it, and that is at least `share` of them. Every setting near this
 * one was right every time on the bench; on a copy of a real book of 648 notes, each tagged note read without its
 * tags (any tag it did not have counted wrong), this one was right 88% of the time and gave a quarter of them one
 * of their own tags back, the most of any setting right more than 85%. Two of five alike at 0.25 was right 80%.
 */
export const TAG_NEAR = { of: 8, score: 0.15, carry: 3, share: 0.6 }

/**
 * The tags the notes most like these words carry, likeliest first, each with how many of them carry it (`notes`)
 * and how many were near enough to count (`of`). Never one the words already carry (`has`), and, two notes having
 * to carry it, never one a single note in the book carries.
 */
export function tagsNear(index: RootIndex, text: string, lemmas: Lemmas | undefined, leave: string, tagsOf: (key: string) => readonly string[], has: Set<string>, meaning: ((key: string) => number) | null = null, near = TAG_NEAR): { tag: string; notes: number; of: number }[] {
  if (new Set(index.folded(text, lemmas)).size < 4) return []
  const nearest = tieBreak(index.rank(index.vector(text, lemmas), leave).slice(0, near.of), meaning && ((one) => meaning(one.key))).filter((one) => one.score >= near.score)
  const votes = new Map<string, number>()
  for (const one of nearest) for (const tag of new Set(tagsOf(one.key))) votes.set(tag, (votes.get(tag) ?? 0) + 1)
  // Its own words must say so too (17 Nov: "youtube hooks:", a list of video hooks, was offered #bug-report because 3
  // of its 5 nearest notes carry it, alike only by everyday words): the tag's own name is among its words, or two of
  // its roots that are not everyday in the book (in one note in ten at most) run through most of the near notes that carry it.
  const own = new Set(index.folded(text, lemmas))
  const rare = Math.max(3, index.notes.length * 0.1)
  const supported = (tag: string): boolean => {
    if (index.folded(tag.replace(/[-_/]+/g, ' '), undefined).some((root) => own.has(root))) return true
    const carriers = nearest.filter((one) => tagsOf(one.key).includes(tag)).map((one) => index.vectorOf(one.key))
    const most = Math.ceil(carriers.length / 2)
    return [...own].filter((root) => index.notesWith(root) <= rare && carriers.filter((one) => one?.has(root)).length >= most).length >= 2
  }
  return [...votes].filter(([tag, n]) => n >= Math.max(2, near.carry) && n / nearest.length >= near.share && !has.has(tag) && supported(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, notes]) => ({ tag, notes, of: nearest.length }))
}

export function whichFolder(index: RootIndex, key: string, folders: Map<string, string[]>): { folder: string; score: number } | null {
  const own = index.vectorOf(key)
  if (!own || own.size < 4) return null
  const scored = [...folders].filter(([, keys]) => keys.length >= 2).map(([folder, keys]) => ({
    folder,
    score: cosine(own, centroid(keys.filter((one) => one !== key).map((one) => index.vectorOf(one)).filter((one): one is Vector => !!one)))
  })).sort((a, b) => b.score - a.score)
  if (!scored[0] || scored[0].score < FOLDER.score || scored[0].score - (scored[1]?.score ?? 0) < FOLDER.margin) return null
  return scored[0]
}

/**
 * "Links suggest themselves": another note's title named in these words, root
 * by root ("the Stoics" names "Stoicism"), where it is not already a link.
 * The whole name is matched word for word inside one line: its numbers and
 * short words count ("Board 1 1" is not named by a note saying "Board 1"),
 * and a name never runs from the end of one line into the next. A leading
 * "the", "a" or "an" in the name may be left out. A one-word title must be a
 * rare root in the book (in one note in twenty at most, or three in a small
 * book), so "Notes" or "Ideas" never asks to be linked everywhere. The words
 * shown are the words as written in that line.
 */
type Word = { lower: string; root: string | null; from: number; to: number }
const ARTICLES = new Set(['the', 'a', 'an'])
const wordsOf = (index: RootIndex, line: string, lemmas: Lemmas | undefined): Word[] =>
  [...line.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ lower: match[0].toLowerCase(), root: index.folded(match[0], lemmas)[0] ?? null, from: match.index, to: match.index + match[0].length }))
/** One word of a name against one written: the same word, or the same root ("Stoics" and "Stoicism"). */
const same = (a: Word, b: Word): boolean => a.lower === b.lower || (a.root !== null && a.root === b.root)

export function linksIn(index: RootIndex, text: string, lemmas: Lemmas | undefined, leave: string, linked: Set<string> = new Set(), everyday: (word: string) => boolean = () => false): { key: string; title: string; words: string }[] {
  // Web addresses and file paths hold no names (name-match.ts, the rules shared with the Mentions lists).
  const lines = text.split(/\r?\n/).map((raw) => withoutAddresses(raw)).map((line) => ({ line, words: wordsOf(index, line, lemmas) })).filter((one) => one.words.length)
  // The note's own name: another note of the same name (the gem made from a capture) is the note itself, and two of one name are offered once.
  const own = index.notes.find((note) => note.key === leave)
  const said = new Set<string>(own ? [nameOf(own.title).toLowerCase()] : [])
  // Every word and root the text holds: a name whose first word is not among them is passed over at once.
  const held = new Set(lines.flatMap((one) => one.words.flatMap((word) => (word.root ? [word.lower, word.root] : [word.lower]))))
  const out: { key: string; title: string; words: string }[] = []
  for (const note of index.notes) {
    if (note.key === leave || linked.has(note.key)) continue
    // A name's tags ("Frankenstein #book") are not its words: "a book club" never names it, and the offer says "Frankenstein".
    const name = note.title.replace(/(?:^|\s)#[\p{L}\p{N}_\/-]+/gu, '').trim()
    const title = index.folded(name, note.lemmas)
    if (!title.length || title.length > 5 || name.split(/\s+/).length > 6 || said.has(nameOf(name).toLowerCase())) continue
    // "Untitled", a number, a date or a name under four letters names nothing.
    const plain = nameFrom(note.key, name)
    if (!plain) continue
    // One in twenty notes at most (three in a small book): a word nearly every note has names nothing.
    if (title.length === 1 && (title[0].length < 5 || index.notesWith(title[0]) > Math.max(3, index.notes.length / 20))) continue
    let want = wordsOf(index, name, note.lemmas)
    // "The Picture of Dorian Gray" may be written without its "the"; "The Scroll" keeps it, or any "scrolls" would name it.
    if (want.length > 2 && ARTICLES.has(want[0].lower)) want = want.slice(1)
    // A name of everyday words ("Protocol", "Reading queue") counts only where it is written as a name.
    const needsCapitals = ordinary(plain, everyday)
    if (!held.has(want[0].lower) && !(want[0].root !== null && held.has(want[0].root))) continue
    for (const { line, words } of lines) {
      const at = words.findIndex((_, i) => i + want.length <= words.length && want.every((word, j) => same(word, words[i + j])) && (!needsCapitals || writtenAsName(line, words[i].from, words[i + want.length - 1].to)))
      if (at < 0) continue
      said.add(nameOf(name).toLowerCase())
      out.push({ key: note.key, title: name, words: line.slice(words[at].from, words[at + want.length - 1].to) })
      break
    }
  }
  return out
}

/**
 * Words that say a name is a thing and not a person, whatever the Mac tags it: a site or a wiki ("Elden Ring Lore
 * Wiki"), a company or a body ("Bell Labs"), a product ("Asahi Linux", "Arc Raiders Quick Menu") or a method named
 * after someone ("Dan Harmon Circle"). No one's own name holds one.
 */
const THINGS = new Set(('wiki wikis wikipedia fandom blog forum website ' +
  'inc ltd llc plc gmbh corp corporation company labs studios publishing publishers media magazine journal quarterly podcast channel university college institute foundation society association museum library ' +
  'app apps api apis sdk plugin plugins menu software linux ' +
  'circle cycle method technique principle theorem effect paradox formula').split(' '))
/** A word of a name as one is written: with a capital ("Wilde", "van Rossum"'s "Rossum"), or initials ("J.R.R."). */
const nameWord = (word: string): boolean => /^\p{Lu}/u.test(word)
/** An acronym (API, IRA) beside words in lower case marks a product or a body; a king's numeral ("Henry VIII") does not. */
const acronym = (word: string): boolean => /^\p{Lu}{3,}$/u.test(word) && !/^[IVXLCDM]+$/.test(word)

/**
 * The people a note names, as Apple's Natural Language tags them, kept to
 * those that are surely people: a name that is also an everyday word ("Tempo",
 * "Brown", "Bake" at a sentence's start) is not, a leading everyday word goes
 * ("Call Paul" is Paul, "Lady Jessica" is Jessica), and a name tagged a place
 * in the same words is a place. One word alone ("Andromeda", "Arrakis",
 * "David" the statue) was a person only 4 times in 5 on the bench, so a single
 * name is offered only when it is already one of your People (as a link to
 * their page). Organisations were right 1 time in 5 (ATP, ISO, Saturn), so
 * none are offered, nor a name the Mac tags a person whose words say it is a
 * site, a company, a product or a method (THINGS, or an acronym: "Roth IRA").
 * The Mac's words may run past the name: a dash or a colon ends it
 * ("Epictetus - What You Read"), and words without a capital at either end are
 * not part of it ("Devon Crawford aesthetic", "reed.dread Bayle").
 */
export function peopleIn(names: { text: string; kind: string }[], common: (word: string) => boolean, known: (name: string) => boolean = () => false): string[] {
  const places = new Set(names.filter((one) => one.kind === 'place').map((one) => one.text))
  const out = new Set<string>()
  for (const one of names) {
    if (one.kind !== 'person' || places.has(one.text)) continue
    const words = one.text.split(/\s+[-\u2013\u2014]\s+|:\s/)[0].split(/\s+/).filter(Boolean)
    while (words.length && !nameWord(words.at(-1)!)) words.pop()
    if (words.some((word) => THINGS.has(word.toLowerCase())) || (words.some((word) => /\p{Ll}/u.test(word)) && words.some(acronym))) continue
    while (words.length && (!nameWord(words[0]) || common(words[0].toLowerCase()))) words.shift()
    if (!words.length || (words.length === 1 && (words[0].length < 3 || common(words[0].toLowerCase()) || !known(words[0])))) continue
    out.add(words.join(' '))
  }
  return [...out]
}
