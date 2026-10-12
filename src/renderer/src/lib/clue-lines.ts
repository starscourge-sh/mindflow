import { vigil } from './vigil'
import { readLines } from '../../../main/day-lines'

/**
 * Words written as a list ("- saw it at dawn", "- again at noon") kept as a
 * clue or log each, in order, as a list typed or pasted anywhere else becomes
 * a thing a line. Gives back the ids made, or null when the words are one
 * thought (one line), for the caller's usual single keep.
 */
export async function keepLines(id: string, text: string): Promise<string[] | null> {
  const lines = readLines(text)
  if (lines.length < 2) return null
  const made: string[] = []
  for (const line of lines) {
    const one = await vigil.addClue(id, line.text)
    if (one) made.push(one)
  }
  return made
}

/** Every one of them taken back. */
export const dropLines = (ids: string[]): Promise<unknown> => Promise.all(ids.map((one) => vigil.dropClue(one)))
