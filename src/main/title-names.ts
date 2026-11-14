import { withoutTags } from './tag-words.ts'

/** Every place `name` stands in `text` lies inside one of `titles` as written there. */
export function onlyInTitles(text: string, name: string, titles: string[]): boolean {
  const lower = text.toLowerCase()
  const at = (word: string, from: number): number => lower.indexOf(word.toLowerCase(), from)
  const held = new Set<number>()
  for (const title of titles) {
    if (!title.toLowerCase().includes(name.toLowerCase())) continue
    for (let i = at(title, 0); i >= 0; i = at(title, i + 1)) {
      const inner = title.toLowerCase().indexOf(name.toLowerCase())
      held.add(i + inner)
    }
  }
  let seen = false
  for (let i = at(name, 0); i >= 0; i = at(name, i + 1)) {
    seen = true
    if (!held.has(i)) return false
  }
  return seen
}

/**
 * The small words a title is joined by, which stay in lower case in it ("The Picture of Dorian Gray"). Not "with":
 * "Lunch with Mary Shelley" beside a name is a lunch, not a work.
 */
const JOINS = new Set('a an the and or nor but of in on at to for by from as vs'.split(' '))
/**
 * The words some words end with that are set as a title, as written: two or more, from a word with a capital, each
 * word of substance with a capital or a number ("I am reading The Picture of Dorian Gray" ends with one).
 */
const titleAtEnd = (words: string): string => {
  const all = [...words.matchAll(/\S+/g)]
  const capital = (i: number): boolean => /^[\p{Lu}\p{N}]/u.test(all[i][0])
  let from = all.length
  while (from > 0 && (capital(from - 1) || JOINS.has(all[from - 1][0].toLowerCase()))) from--
  while (from < all.length && !capital(from)) from++
  return all.length - from >= 2 ? words.slice(all[from].index) : ''
}
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `name` stands in `words` as whole words, and the words hold more than it. */
const holdsMore = (words: string, name: string): boolean => words !== name && new RegExp(`(?:^|[^\\p{L}])${literal(name)}(?![\\p{L}])`, 'u').test(words)

/**
 * The titles of works written in a note, as written there: words set as a title that hold a name and more than it,
 * with the work's author named beside them after a dash or "by" (a reading list's "The Picture of Dorian Gray", a
 * dash, "Oscar Wilde"; "The Picture of Dorian Gray by Oscar Wilde"). `names` are the names the note holds; an author
 * is one of them. Without its author nothing says whose a name is: "Works of Friedrich Nietzsche" alone on its line
 * is his works, and the quoted title “Analysing Taylor Swift's Eras” is about her.
 */
export function titlesWritten(text: string, names: string[]): string[] {
  const out = new Set<string>()
  // Its author: another name, that another part of the line begins with.
  const by = (part: string, name: string): boolean => names.some((author) => author !== name && new RegExp(`^${literal(author)}(?![\\p{L}])`, 'iu').test(part))
  for (const line of text.split('\n')) {
    // Only a line holding a name is read further: a note may be a million characters long.
    if (!names.some((name) => line.includes(name))) continue
    // A remark in brackets after an entry ("Aldous Huxley (control by force)") is not a part of it.
    const parts = line.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').split(/\s+[-\u2013\u2014]\s+|\s+by\s+/).map((part) => part.trim().replace(/[.,;:!?]+$/, ''))
    for (const part of parts) {
      const title = titleAtEnd(part)
      const name = title && names.find((one) => holdsMore(title, one))
      if (name && parts.some((other) => other !== part && by(other, name))) out.add(title)
    }
  }
  return [...out]
}

export type Named = {
  people: { name: string; known: boolean }[]
  characters: { name: string; work: string; known: boolean }[]
}
export type Book = {
  /** Your characters, by their name in lower case, each with the work they are in. */
  cast: Map<string, { name: string; work: string }>
  /** Your People, by their name in lower case. */
  people: Set<string>
  /** The titles of works the book holds (book-offers.ts `works`). */
  titles: string[]
  /** The work the note is about, when it is about one, and its author. */
  about: { work: string; author: string } | null
}

/**
 * Where each name a note holds (roots.ts peopleIn) is offered: a character already kept; a name met only inside the
 * title of a work, the book's or one written in the note with its author ("The Picture of Dorian Gray"), a character in
 * it, and never a person (one of your People named only in a title is offered nothing: the words name the work); a
 * person you know; anyone a note about a work names, besides its author, a character of that work; anyone else, a person.
 */
export function sortNamed(text: string, found: string[], { cast, people, titles, about }: Book): Named {
  const characters: Named['characters'] = []
  const persons: Named['people'] = []
  const works = [...titles, ...titlesWritten(text, found)]
  for (const name of found) {
    const lower = name.toLowerCase()
    const kept = cast.get(lower)
    if (kept) characters.push({ name: kept.name, work: kept.work, known: true })
    else if (onlyInTitles(text, name, works)) {
      if (people.has(lower)) continue
      // The work by its name alone: a note's title carries its tags ("The Picture of Dorian Gray #book").
      const held = works.find((title) => title.toLowerCase().includes(lower) && text.toLowerCase().includes(title.toLowerCase()))
      characters.push({ name, work: held ? withoutTags(held).replace(/\s+/g, ' ').trim() : about?.work ?? name, known: false })
    }
    else if (people.has(lower)) persons.push({ name, known: true })
    else if (about && lower !== about.author.toLowerCase() && !about.work.toLowerCase().includes(lower)) characters.push({ name, work: about.work, known: false })
    else if (!about || lower !== about.author.toLowerCase()) persons.push({ name, known: false })
  }
  return { people: persons, characters }
}
