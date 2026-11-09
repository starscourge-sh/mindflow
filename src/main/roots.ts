import { tokens } from './likeness.ts'

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
 * Which folder?, A clue for your question, Notes at the right moment) has a
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
 * A one-word title must be a rare root in the book (in one note in twenty
 * at most, or three in a small book), so "Notes" or "Ideas" never asks to be
 * linked everywhere.
 */
export function linksIn(index: RootIndex, text: string, lemmas: Lemmas | undefined, leave: string, linked: Set<string> = new Set()): { key: string; title: string; words: string }[] {
  const words = text.split(/([^\p{L}\p{N}]+)/u)
  const said = index.folded(text, lemmas)
  const out: { key: string; title: string; words: string }[] = []
  for (const note of index.notes) {
    if (note.key === leave || linked.has(note.key)) continue
    // A name's tags ("Frankenstein #book") are not its words: "a book club" never names it, and the offer says "Frankenstein".
    const name = note.title.replace(/(?:^|\s)#[\p{L}\p{N}_\/-]+/gu, '').trim()
    const title = index.folded(name, note.lemmas)
    if (!title.length || title.length > 5 || name.split(/\s+/).length > 6) continue
    // One in twenty notes at most (three in a small book): a word nearly every note has names nothing.
    if (title.length === 1 && (title[0].length < 5 || index.notesWith(title[0]) > Math.max(3, index.notes.length / 20))) continue
    const at = said.findIndex((_, i) => title.every((root, j) => said[i + j] === root))
    if (at < 0) continue
    // The words as written, for the offer to show: the run of tokens that matched.
    const plain = tokens(text)
    const shown = plain.slice(at, at + title.length).join(' ')
    out.push({ key: note.key, title: name, words: words.find((one) => one.toLowerCase() === shown) ?? shown })
  }
  return out
}

/**
 * The people a note names, as Apple's Natural Language tags them, kept to
 * those that are surely people: a name that is also an everyday word ("Tempo",
 * "Brown", "Bake" at a sentence's start) is not, a leading everyday word goes
 * ("Call Paul" is Paul, "Lady Jessica" is Jessica), and a name tagged a place
 * in the same words is a place. One word alone ("Andromeda", "Arrakis",
 * "David" the statue) was a person only 4 times in 5 on the bench, so a single
 * name is offered only when it is already one of your People (as a link to
 * their page). Organisations were right 1 time in 5 (ATP, ISO, Saturn), so
 * none are offered.
 */
export function peopleIn(names: { text: string; kind: string }[], common: (word: string) => boolean, known: (name: string) => boolean = () => false): string[] {
  const places = new Set(names.filter((one) => one.kind === 'place').map((one) => one.text))
  const out = new Set<string>()
  for (const one of names) {
    if (one.kind !== 'person' || places.has(one.text)) continue
    const words = one.text.split(/\s+/)
    while (words.length && common(words[0].toLowerCase())) words.shift()
    if (!words.length || (words.length === 1 && (words[0].length < 3 || common(words[0].toLowerCase()) || !known(words[0])))) continue
    out.add(words.join(' '))
  }
  return [...out]
}
