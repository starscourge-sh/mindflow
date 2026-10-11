// Run with: node --test test/quoted-labels.test.ts
// A button or menu item named in a sentence runs into it unless it is set off:
// "choose This turned out wrong… under Wrong?." reads as one long muddle.
// Labels the reader must find go in curly quotes: choose “This turned out
// wrong…” under “Wrong?”. This reads the What Vigil can do lines (powers.ts)
// and the Learn Vigil deck (learn-deck.ts) and fails on "choose", "pick" or
// "turn on" followed straight by a capitalised word, with no quote between.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

/** The single-quoted strings after these keys, with their line. */
function strings(text: string, keys: string[]): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  const pattern = new RegExp(`\\b(?:${keys.join('|')}): '((?:[^'\\\\]|\\\\.)*)'`, 'g')
  for (const match of text.matchAll(pattern)) out.push({ line: text.slice(0, match.index).split('\n').length, text: match[1] })
  return out
}

const BARE = /\b(?:choose|pick|turn on)\s+[A-Z][\w’']*/gi

function bare(file: string, found: { line: number; text: string }[]): string[] {
  return found.flatMap(({ line, text }) => [...text.matchAll(BARE)].filter((m) => /[A-Z]/.test(m[0].split(/\s+/).at(-1)![0])).map((m) => `${file}:${line}: "${m[0]}" (put the label in “…”)`))
}

test('Try it lines and Show me words quote the labels they name', () => {
  const file = 'src/renderer/src/lib/powers.ts'
  assert.deepEqual(bare(file, strings(read(file), ['tryIt', 'text', 'line'])), [])
})

test('the Learn Vigil deck quotes the labels it names', () => {
  const file = 'src/main/learn-deck.ts'
  // Only today's deck: the earlier wordings kept for old cards are left as they were.
  const deck = read(file).split('export const LEARN_EARLIER')[0]
  assert.deepEqual(bare(file, strings(deck, ['question', 'answer'])), [])
})
