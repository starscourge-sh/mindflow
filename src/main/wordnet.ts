import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { DatabaseSync } from 'node:sqlite'

/**
 * WordNet, on this Mac, with no network. The database is Princeton's, kept
 * beside the app (resources/wordnet) and opened from a copy in the temp folder.
 * WordNet 3.0 Copyright 2006 by Princeton University. The licence file ships
 * with the database: use, including in a sold app, with that notice kept.
 */

export type Sense = {
  pos: 'noun' | 'verb' | 'adjective' | 'adverb'
  gloss: string
  synonyms: string[]
  broader: string[]
  narrower: string[]
}
export type Entry = { word: string; senses: Sense[] }

const POS: Record<string, Sense['pos']> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' }
const lines = (text: string): string[] => text ? text.split('\n').filter(Boolean) : []

let db: DatabaseSync | null | undefined

function packed(): string | null {
  const list = [
    join(process.cwd(), 'resources/wordnet/wordnet.sqlite.gz'),
    join(process.resourcesPath || '', 'app.asar.unpacked/resources/wordnet/wordnet.sqlite.gz'),
    join(process.resourcesPath || '', 'resources/wordnet/wordnet.sqlite.gz')
  ]
  return list.find((one) => existsSync(one)) ?? null
}

function open(): DatabaseSync | null {
  if (db !== undefined) return db
  const gz = packed()
  if (!gz) return (db = null)
  const out = join(tmpdir(), 'haligtree-wordnet.sqlite')
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(gz).mtimeMs)
    writeFileSync(out, gunzipSync(readFileSync(gz)))
  db = new DatabaseSync(out, { readOnly: true })
  return db
}

const clean = (word: string): string => word.trim().toLowerCase().replace(/^#+/, '')

/** Other words of the same family: "decide" includes "decision". Empty when WordNet has none. */
export function familyOf(word: string): string[] {
  const file = open()
  const key = clean(word)
  if (!file || key.length < 3) return []
  const row = file.prepare('select words from family where word = ?').get(key) as { words: string } | undefined
  return lines(row?.words ?? '')
}

/** A word's senses: what it means, the words of that sense, and the broader and narrower ones. */
export function defineWord(word: string): Entry | null {
  const file = open()
  const key = clean(word)
  if (!file || !key) return null
  const rows = file.prepare('select pos, gloss, synonyms, broader, narrower from sense where word = ?').all(key) as { pos: string; gloss: string; synonyms: string; broader: string; narrower: string }[]
  if (!rows.length) return null
  return {
    word: key,
    senses: rows.flatMap((row) => {
      const pos = POS[row.pos]
      return pos ? [{ pos, gloss: row.gloss, synonyms: lines(row.synonyms), broader: lines(row.broader), narrower: lines(row.narrower) }] : []
    })
  }
}
