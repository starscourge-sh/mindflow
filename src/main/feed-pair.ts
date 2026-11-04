/**
 * "Two subjects, one thread": two of your notes that share no tag but do share
 * something else, found without AI. In order of how telling it is: an unusual
 * word (in only these two notes of the whole book, not a common word), the same
 * source quoted, or kept within the same hour. Filing tags (#quote, #mine and
 * the like) count for nothing. No honest pair, no post.
 */
export type PairNote = { key: string; id: string; title: string; text: string; tags: string[]; who: string | null; made: string; /** Brought in by an importer: its date is the import's, so never "kept within the same hour". */ imported?: boolean }
export type PairWhy = { kind: 'word'; word: string } | { kind: 'source'; source: string } | { kind: 'hour' }
export type Pair = { a: PairNote; b: PairNote; why: PairWhy }

/** Words too common to say anything, however rare they happen to be in one book. */
const STOP = new Set(('about above after again against almost along already also although always among another anyone anything around because been before being below between both cannot could does doing down during each either enough every everything first from further going have having here itself just know last later least less like little made make many maybe might more most much must myself never next nothing often once only other ought ourselves over perhaps quite rather really same says seem seems should since some something still such than that their theirs them themselves then there these they thing things think this those though through thus together under until upon very want were what whatever when where whether which while whole whom whose will with within without would year years your yours yourself today tomorrow yesterday people person time times good great well back away into onto even ever every right left need needs used using use')
  .split(/\s+/))

/** A note's own words, once each: lower case, letters only, five letters or more, not a common word. */
export const wordsOf = (text: string): Set<string> =>
  new Set((text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/\p{L}{5,}/gu) ?? []).filter((word) => !STOP.has(word)))

const HOUR = 60 * 60 * 1000

/**
 * The day's pair, or null. `book` is every note's words in the whole book (for
 * how rare a word is); `seed` turns the choice among equally good pairs, so a
 * different one can come on another day.
 */
export function findPair(notes: PairNote[], filing: Set<string>, book: string[], seed = 0): Pair | null {
  const subjects = (note: PairNote): string[] => note.tags.map((tag) => tag.toLowerCase()).filter((tag) => !filing.has(tag))
  // Only notes with a subject of their own: two subjects, so each says what it is about.
  const usable = notes.filter((note) => subjects(note).length > 0)
  const apart = (a: PairNote, b: PairNote): boolean => a.id !== b.id && !subjects(a).some((tag) => subjects(b).includes(tag))
  const turn = <T,>(list: T[]): T | undefined => list[Math.abs(seed) % Math.max(1, list.length)]

  // How many notes of the whole book each word is in.
  const seen = new Map<string, number>()
  for (const text of book) for (const word of wordsOf(text)) seen.set(word, (seen.get(word) ?? 0) + 1)
  const mine = new Map(usable.map((note) => [note.id, wordsOf(`${note.title} ${note.text}`)]))
  // A tag's own word is the subject, not a thread between two.
  const tagWords = new Set(usable.flatMap(subjects))
  const byWord = new Map<string, PairNote[]>()
  for (const note of usable) for (const word of mine.get(note.id)!) if (seen.get(word) === 2 && !tagWords.has(word)) byWord.set(word, [...(byWord.get(word) ?? []), note])
  const words = [...byWord].filter(([, two]) => two.length === 2 && apart(two[0], two[1])).sort((x, y) => x[0].localeCompare(y[0]))
  const word = turn(words)
  if (word) return { a: word[1][0], b: word[1][1], why: { kind: 'word', word: word[0] } }

  const sources: Pair[] = []
  const bySource = new Map<string, PairNote[]>()
  for (const note of usable) if (note.who?.trim()) bySource.set(note.who.trim().toLowerCase(), [...(bySource.get(note.who.trim().toLowerCase()) ?? []), note])
  for (const list of bySource.values())
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (apart(list[i], list[j])) sources.push({ a: list[i], b: list[j], why: { kind: 'source', source: list[i].who!.trim() } })
  const source = turn(sources)
  if (source) return source

  const sorted = usable.filter((note) => !note.imported).sort((x, y) => x.made.localeCompare(y.made))
  const hours: Pair[] = []
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length && new Date(sorted[j].made).getTime() - new Date(sorted[i].made).getTime() <= HOUR; j++)
      if (apart(sorted[i], sorted[j])) hours.push({ a: sorted[i], b: sorted[j], why: { kind: 'hour' } })
  return turn(hours) ?? null
}
