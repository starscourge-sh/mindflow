/**
 * What each kind asks for besides its words, in one table: shown in the
 * properties column, saved with the note, and found by search. A kind that
 * asks for nothing has an empty list.
 *
 * A quote's author and source are not here: they are the who and where every
 * capture already has (attribution and medium), asked in the kind's own words
 * by ASKS. These are only what no other kind needs.
 */
export type Field = {
  key: string
  label: string
  /**
   * Text by default; long for a sentence or more, a choice, or 1 to 5 stars.
   * A link holds where another note is (`day:2026-10-05`, `nugget:…`, a
   * capture's id); a date is a day, kept as an ISO string, that brings the
   * note back when it comes; hidden is kept by the app, never typed.
   */
  type?: 'text' | 'long' | 'choice' | 'rating' | 'link' | 'date' | 'hidden'
  options?: string[]
  placeholder?: string
  /** For a date: ways to say it, offered before you type. */
  suggest?: string[]
  /** A faint example shown while it is empty: never saved. */
  ghost?: string
  /** What it does, in a line on hover, while it is empty. */
  does?: string
  /** Shown only once this other field holds this value, or once it has words of its own. */
  when?: [key: string, value: string]
}

export const KIND_FIELDS: Record<string, Field[]> = {
  note: [],
  todo: [],
  // A long quote is what an excerpt was: where in the book it is.
  quote: [{ key: 'location', label: 'Page or place', placeholder: 'e.g. p. 42, chapter 3' }],
  word: [
    { key: 'definition', label: 'Meaning or answer', type: 'long', placeholder: 'What it means, or the answer', ghost: 'Feeling sad that a happy time has passed', does: 'What the word means, or the answer to the question. Until it is written, it waits in Lookups as asked' },
    { key: 'example', label: 'Example', type: 'long', placeholder: 'A sentence it is used in', ghost: 'A wistful look back at the summer', does: 'A sentence that uses it, so you remember how it sounds' },
    { key: 'language', label: 'Language', placeholder: 'e.g. French' }
  ],
  link: [
    { key: 'title', label: 'Title', placeholder: "The page's own title" },
    { key: 'site', label: 'Site', placeholder: 'e.g. nytimes.com' },
    { key: 'status', label: 'Status', type: 'choice', options: ['To read', 'Reading now', 'Done'], does: 'Where you are with it: filter and sort your links by it' },
    { key: 'rating', label: 'Rating', type: 'rating', does: 'How good it was, 1 to 5 stars: sort your list by it' }
  ],
  // A date, then a question back to you: what a decision and an experiment
  // both were. On its day it comes back and asks; your answer is kept under it.
  checkback: [
    { key: 'back', label: 'Check back on', type: 'date', placeholder: 'Check back on…', ghost: 'in a month', does: 'On this day it comes back to you and asks the question below', suggest: ['in a week', 'in 2 weeks', 'in a month', 'in 3 months', 'in a year'] },
    { key: 'ask', label: 'Then ask', type: 'long', placeholder: 'The question to ask you then', ghost: 'Did it work? Does it still hold?', does: 'What it asks you when it comes back' },
    { key: 'answer', label: 'What you found', type: 'long', placeholder: 'Your answer, once it comes back', ghost: 'Slept better on the nights with no phone', does: 'Your answer when it came back, short enough to skim later' },
    { key: 'answeredAt', label: 'Answered on', type: 'hidden' }
  ]
}

/**
 * What a tag asks for, whatever the note's kind: #book makes any note a book,
 * the way a tag marked "makes a task" makes it a todo.
 */
export const TAG_FIELDS: Record<string, Field[]> = {
  book: [
    { key: 'author', label: 'Author', placeholder: 'Who wrote it', does: 'Who wrote it, so the books page can list them by author' },
    { key: 'status', label: 'Status', type: 'choice', options: ['Want to read', 'Reading', 'Finished', 'Dropped'], does: "Where you are with it. The year's books page counts the ones you finish" },
    { key: 'finished', label: 'Finished', type: 'date', does: 'The day you finished it', when: ['status', 'Finished'] },
    { key: 'rating', label: 'Rating', type: 'rating', does: "Rate it once you've read it" },
    { key: 'takeaway', label: 'Takeaway', type: 'long', placeholder: 'What you will keep from it', ghost: 'First impressions can be badly wrong', does: 'The one thing you will keep from it, in a line', when: ['status', 'Finished'] }
  ]
}

/**
 * Super tags: a tag that brings properties with it. These ship with the app,
 * one for each kind that asks for something, and #book; any tag can be given
 * properties of its own (stored on the tag, main/notes.ts `tags:fields`). A
 * note's kind and a tag of the same name bring the same fields.
 */
export const SUPER_TAGS: Record<string, Field[]> = {
  quote: KIND_FIELDS.quote,
  word: KIND_FIELDS.word,
  link: KIND_FIELDS.link,
  checkback: KIND_FIELDS.checkback,
  book: TAG_FIELDS.book
}

/** What the old kinds' fields are called, for a decision or experiment that became a Check back: kept, and named in words. */
export const OLD_LABELS: Record<string, string> = {
  state: 'Status', call: 'The call', options: 'Options weighed', working: 'Working out', reopen: 'Reopen only if',
  status: 'Status', context: 'Started by', question: 'Main question', outcome: 'Outcome', decidedAt: 'Decided on', heldAt: 'Last said it holds'
}

/** The tags that do something, and what, in a line: said in the box, the Tags page and anywhere else they are explained. */
export const TAG_DOES: Record<string, string> = {
  bit: 'Kept private: blurred in lists, never shown as a hint',
  book: 'A book: adds reading status, a 1 to 5 rating and a takeaway'
}

