import { ipcMain, net, shell } from 'electron'
import { readFile } from 'fs/promises'

import { database } from './captures'
import { distance, near } from './near'
import { macLookUp, readMac } from './mac-dictionary'

/**
 * A word's meaning, looked up for the box's Word kind: the Mac's own
 * Dictionary first (mac-dictionary.ts: offline, private, at once), and only
 * when it has nothing, one free dictionary on the web (dictionaryapi.dev),
 * asked from here so the page never talks to the internet itself. Each answer is kept, so a word asked again, or asked
 * offline later, is answered at once. A word it does not know is offered its
 * nearest spelling ("Did you mean serendipity?"), from the Mac's own word
 * list and the same slip-of-a-key test the who field uses, and only a
 * spelling the dictionary knows. Offline or slow, it says nothing.
 */

// A test run on a data folder of its own may point at a dictionary of its own.
const BASE = (process.env.HALIGTREE_USER_DATA && process.env.HALIGTREE_QA_DICT) || 'https://api.dictionaryapi.dev/api/v2/entries/en/'
const AUDIO = /^https:\/\/(api\.dictionaryapi\.dev|ssl\.gstatic\.com)\//
const QA_DICT = BASE.startsWith('http://127.0.0.1') ? new URL(BASE).origin : null
const sound = (url: string): boolean => AUDIO.test(url) || (!!QA_DICT && url.startsWith(QA_DICT))
const WORD = /^\p{L}[\p{L}'-]{1,40}$/u
// A run with its own dictionary server asks only that, so what it sees is the same on every Mac.
const MAC = !QA_DICT || process.env.HALIGTREE_QA_MAC_DICT === 'on'

/** `source`: where the meaning came from, said under it. `also`: a second sense, when there is one. */
export type Defined = { word: string; phonetic: string; audio: string; part: string; definition: string; example: string; also?: string; source?: 'mac' | 'web' }
export type Answer = { found: Defined } | { miss: true; fix: string | null } | { offline: true } | null

type Entry = { word?: string; phonetic?: string; phonetics?: { text?: string; audio?: string }[]; meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[] }

const read = (entries: Entry[]): Defined | null => {
  const entry = entries[0]
  const meaning = entry?.meanings?.find((one) => one.definitions?.some((d) => d.definition))
  const definition = meaning?.definitions?.find((d) => d.definition)?.definition?.trim()
  if (!entry || !meaning || !definition) return null
  const example = entries.flatMap((one) => one.meanings ?? []).flatMap((one) => one.definitions ?? []).find((d) => d.example)?.example?.trim() ?? ''
  const phonetics = entries.flatMap((one) => one.phonetics ?? [])
  return {
    word: entry.word ?? '',
    phonetic: entry.phonetic || phonetics.find((one) => one.text)?.text || '',
    audio: phonetics.find((one) => one.audio && sound(one.audio))?.audio ?? '',
    part: meaning.partOfSpeech ?? '',
    definition,
    example,
    source: 'web'
  }
}

let words: Promise<string[]> | null = null
/** The Mac's word list, lower case, once. Empty where there is none. */
const wordList = (): Promise<string[]> => (words ??= readFile('/usr/share/dict/words', 'utf8').then((text) => [...new Set(text.toLowerCase().split('\n').filter((one) => WORD.test(one)))], () => []))

/** The nearest few spellings, closest first; the same first letter breaks a tie. */
async function nearest(word: string): Promise<string[]> {
  const list = await wordList()
  // Two letters swapped ("recieve", "teh") is the commonest slip of all: one
  // slip, not two, and ahead of a different letter ("relieve").
  const letters = (one: string): string => [...one].sort().join('')
  const mine = letters(word)
  const swapped = (one: string): boolean => one.length === word.length && letters(one) === mine && distance(one, word) <= 2
  return list
    .filter((one) => one !== word && (near(one, word) || swapped(one)))
    .map((one) => ({ one, by: distance(one, word) - (swapped(one) ? 1.5 : 0) + (one[0] === word[0] ? 0 : 0.5) + Math.abs(one.length - word.length) * 0.1 }))
    .sort((a, b) => a.by - b.by)
    .slice(0, 3)
    .map((one) => one.one)
}

export function registerDefine(): void {
  const db = database()
  db.exec('create table if not exists word_meanings (word text primary key, answer text not null, at text not null)')
  const kept = (word: string): Answer | undefined => {
    const row = db.prepare('select answer, at from word_meanings where word = ?').get(word) as { answer: string; at: string } | undefined
    if (!row) return undefined
    const answer = JSON.parse(row.answer) as Answer
    // A word it did not know is asked again after a day: the dictionary grows.
    if (answer && 'miss' in answer && Date.now() - Date.parse(row.at) > 86_400_000) return undefined
    return answer
  }
  const keep = (word: string, answer: Answer): void =>
    void db.prepare('insert or replace into word_meanings (word, answer, at) values (?, ?, ?)').run(word, JSON.stringify(answer), new Date().toISOString())

  /** The dictionary's answer for one spelling: found, not known (404), or no answer at all. */
  const ask = async (word: string): Promise<Answer> => {
    const known = kept(word)
    if (known && !('miss' in known)) return known
    if (MAC) {
      const entry = readMac(await macLookUp(word))
      if (entry) {
        const found: Defined = { ...entry, audio: '', source: 'mac' }
        keep(word, { found })
        return { found }
      }
    }
    try {
      const response = await net.fetch(`${BASE}${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(4000) })
      if (response.status === 404) return { miss: true, fix: null }
      if (!response.ok) return { offline: true }
      const found = read((await response.json()) as Entry[])
      if (!found) return { miss: true, fix: null }
      keep(word, { found })
      return { found }
    } catch {
      return { offline: true }
    }
  }

  ipcMain.handle('haligtree:define', async (_event, raw: unknown) => {
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!WORD.test(word)) return null
    const known = kept(word)
    if (known) return known
    const answer = await ask(word)
    if (answer && 'found' in answer) return answer
    // Not a word it knows: the nearest spelling it does know, if any. On a
    // Mac only its Dictionary is asked, so a slow or missing connection never
    // keeps a slip of the key waiting.
    for (const fix of await nearest(word)) {
      const tried = MAC ? (readMac(await macLookUp(fix)) ? { found: true } : null) : await ask(fix)
      if (tried && 'offline' in tried) return tried
      if (tried && 'found' in tried) {
        const said: Answer = { miss: true, fix }
        keep(word, said)
        return said
      }
    }
    // The web not reached, and nothing near: nothing said, and asked again later.
    if (!answer || 'offline' in answer) return answer
    const none: Answer = { miss: true, fix: null }
    keep(word, none)
    return none
  })

  // The whole entry in the Dictionary app, from the meaning's right-click menu.
  ipcMain.handle('haligtree:define:open', (_event, raw: unknown) => {
    const word = typeof raw === 'string' ? raw.trim() : ''
    if (WORD.test(word.toLowerCase())) void shell.openExternal(`dict://${encodeURIComponent(word)}`)
  })

  // Its sound, fetched here on a click: the page may not reach the internet itself.
  ipcMain.handle('haligtree:define:audio', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !sound(url)) return null
    try {
      const response = await net.fetch(url, { signal: AbortSignal.timeout(6000) })
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
    } catch {
      return null
    }
  })
}
