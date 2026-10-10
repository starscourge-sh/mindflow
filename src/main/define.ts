import { ipcMain, net } from 'electron'
import { readFile } from 'fs/promises'

import { database } from './captures'
import { distance, near } from './near'

/**
 * A word's meaning, looked up for the box's Word kind: one free dictionary
 * (dictionaryapi.dev), asked from here so the page never talks to the
 * internet itself. Each answer is kept, so a word asked again, or asked
 * offline later, is answered at once. A word it does not know is offered its
 * nearest spelling ("Did you mean serendipity?"), from the Mac's own word
 * list and the same slip-of-a-key test the who field uses, and only a
 * spelling the dictionary knows. Offline or slow, it says nothing.
 */

// A test run on a data folder of its own may point at a dictionary of its own.
const BASE = (process.env.MINDFLOW_USER_DATA && process.env.MINDFLOW_QA_DICT) || 'https://api.dictionaryapi.dev/api/v2/entries/en/'
const AUDIO = /^https:\/\/(api\.dictionaryapi\.dev|ssl\.gstatic\.com)\//
const QA_DICT = BASE.startsWith('http://127.0.0.1') ? new URL(BASE).origin : null
const sound = (url: string): boolean => AUDIO.test(url) || (!!QA_DICT && url.startsWith(QA_DICT))
const WORD = /^[a-z][a-z'-]{1,40}$/

export type Defined = { word: string; phonetic: string; audio: string; part: string; definition: string; example: string }
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
    example
  }
}

let words: Promise<string[]> | null = null
/** The Mac's word list, lower case, once. Empty where there is none. */
const wordList = (): Promise<string[]> => (words ??= readFile('/usr/share/dict/words', 'utf8').then((text) => [...new Set(text.toLowerCase().split('\n').filter((one) => WORD.test(one)))], () => []))

/** The nearest few spellings, closest first; the same first letter breaks a tie. */
async function nearest(word: string): Promise<string[]> {
  const list = await wordList()
  return list
    .filter((one) => one !== word && near(one, word))
    .map((one) => ({ one, by: distance(one, word) + (one[0] === word[0] ? 0 : 0.5) + Math.abs(one.length - word.length) * 0.1 }))
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
    try {
      const response = await net.fetch(`${BASE}${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(6000) })
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

  ipcMain.handle('vigil:define', async (_event, raw: unknown) => {
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!WORD.test(word)) return null
    const known = kept(word)
    if (known) return known
    const answer = await ask(word)
    if (!answer || !('miss' in answer)) return answer
    // Not a word it knows: the nearest spelling it does know, if any.
    for (const fix of await nearest(word)) {
      const tried = await ask(fix)
      if (tried && 'offline' in tried) return tried
      if (tried && 'found' in tried) {
        const said: Answer = { miss: true, fix }
        keep(word, said)
        return said
      }
    }
    const none: Answer = { miss: true, fix: null }
    keep(word, none)
    return none
  })

  // Its sound, fetched here on a click: the page may not reach the internet itself.
  ipcMain.handle('vigil:define:audio', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !sound(url)) return null
    try {
      const response = await net.fetch(url, { signal: AbortSignal.timeout(6000) })
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
    } catch {
      return null
    }
  })
}
