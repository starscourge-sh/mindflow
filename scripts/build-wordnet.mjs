// Builds resources/wordnet/wordnet.sqlite from the WordNet database files in a
// wordnet-db tarball (Princeton's dict/). Run: node scripts/build-wordnet.mjs /tmp/wordnet-db.tgz
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const tarball = process.argv[2]
if (!tarball) throw new Error('Pass the wordnet-db tarball')
const root = new URL('../resources/wordnet/', import.meta.url)
mkdirSync(root, { recursive: true })

const file = (name) => execFileSync('tar', ['-xOf', tarball, `package/dict/${name}`], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
const licence = execFileSync('tar', ['-xOf', tarball, 'package/LICENSE'], { maxBuffer: 1024 * 1024 }).toString('utf8')
writeFileSync(new URL('LICENSE', root), licence)

const readData = (name, pos) => {
  const synsets = new Map()
  for (const line of file(name).split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const bar = line.indexOf(' | ')
    if (bar < 0) continue
    const gloss = line.slice(bar + 3).replace(/\s+/g, ' ').trim().slice(0, 280)
    const tokens = line.slice(0, bar).trim().split(/\s+/)
    const offset = tokens[0]
    const count = parseInt(tokens[3], 16)
    const words = []
    let at = 4
    for (let i = 0; i < count; i++) {
      words.push(tokens[at].replace(/_/g, ' ').toLowerCase())
      at += 2
    }
    const pointers = Number(tokens[at] ?? 0)
    at += 1
    const links = []
    for (let i = 0; i < pointers; i++) {
      const kind = tokens[at]
      if (kind === '+' || kind === '@' || kind === '@i' || kind === '~' || kind === '~i')
        links.push({ kind: kind[0], offset: tokens[at + 1], pos: tokens[at + 2] })
      at += 4
    }
    synsets.set(`${pos}:${offset}`, { words, gloss, links })
  }
  return synsets
}

const synsets = new Map()
for (const [name, pos] of [['data.noun', 'n'], ['data.verb', 'v'], ['data.adj', 'a'], ['data.adv', 'r']]) {
  for (const [key, value] of readData(name, pos)) synsets.set(key, value)
}
const wordsOf = (pos, offset) => synsets.get(`${pos}:${offset}`)?.words ?? []
const few = (list, skip) => [...new Set(list.filter((word) => word && word !== skip))].slice(0, 6)

const senses = new Map()
const addSense = (word, sense) => {
  const list = senses.get(word) ?? []
  if (list.length < 4) list.push(sense)
  senses.set(word, list)
}
const families = new Map()
const addFamily = (word, extra) => {
  if (word.includes(' ')) return
  const set = families.get(word) ?? new Set()
  for (const one of extra) if (one && one !== word && !one.includes(' ') && set.size < 16) set.add(one)
  if (set.size) families.set(word, set)
}

for (const name of ['index.noun', 'index.verb', 'index.adj', 'index.adv']) {
  for (const line of file(name).split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const parts = line.trim().split(/\s+/)
    const lemma = parts[0].replace(/_/g, ' ').toLowerCase()
    const pos = parts[1] === 's' ? 'a' : parts[1]
    const synsetCount = Number(parts[2])
    const pointerCount = Number(parts[3])
    const offsets = parts.slice(4 + pointerCount + 2, 4 + pointerCount + 2 + synsetCount)
    for (const offset of offsets) {
      const synset = synsets.get(`${pos}:${offset}`)
      if (!synset) continue
      const synonyms = few(synset.words, lemma)
      const broader = few(synset.links.filter((one) => one.kind === '@').flatMap((one) => wordsOf(one.pos, one.offset)), lemma)
      const narrower = few(synset.links.filter((one) => one.kind === '~').flatMap((one) => wordsOf(one.pos, one.offset)), lemma)
      const derived = few(synset.links.filter((one) => one.kind === '+').flatMap((one) => wordsOf(one.pos, one.offset)), lemma)
      addSense(lemma, { pos, gloss: synset.gloss, synonyms, broader, narrower })
      addFamily(lemma, [...synonyms, ...derived])
    }
  }
}

const db = new DatabaseSync(new URL('wordnet.sqlite', root).pathname)
db.exec('drop table if exists family; drop table if exists sense')
db.exec('create table family (word text primary key, words text not null)')
db.exec('create table sense (word text not null, pos text not null, gloss text not null, synonyms text not null, broader text not null, narrower text not null)')
db.exec('create index sense_word on sense(word)')
const putFamily = db.prepare('insert into family (word, words) values (?, ?)')
const putSense = db.prepare('insert into sense (word, pos, gloss, synonyms, broader, narrower) values (?, ?, ?, ?, ?, ?)')
db.exec('begin')
for (const [word, set] of families) putFamily.run(word, [...set].join('\n'))
for (const [word, list] of senses) for (const sense of list) putSense.run(word, sense.pos, sense.gloss, sense.synonyms.join('\n'), sense.broader.join('\n'), sense.narrower.join('\n'))
db.exec('commit')
db.close()
console.log(`lemmas ${families.size}, senses ${[...senses.values()].reduce((sum, list) => sum + list.length, 0)}`)
