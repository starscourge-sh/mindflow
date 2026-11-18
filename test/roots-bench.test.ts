// The offers made by shared root words (src/main/roots.ts), measured on a book of 200 notes with known right
// answers (test/fixtures/roots-bench.ts), roots read by this Mac's own Natural Language (resources/understand).
// Precision: of the offers made, how many were right. Reach: of the cases with a right answer, how many got one.
// An offer ships only at 80% precision or more; the numbers print each run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { RootIndex, alreadyWrote, cluesFor, linksIn, peopleIn, tagsNear, whichFolder, type Lemmas } from '../src/main/roots.ts'
import { readFileSync } from 'node:fs'
import { FRAMES, LOOSE_LIFE, TOPICS, book, tagsOfBook } from './fixtures/roots-bench.ts'

const HELPER = new URL('../resources/understand', import.meta.url).pathname

/** Each text's roots, from the Mac. */
async function lemmasOf(texts: string[]): Promise<Lemmas[]> {
  const child = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  let out = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => (out += chunk))
  const done = new Promise((resolve) => child.on('close', resolve))
  texts.forEach((text, id) => child.stdin.write(`${JSON.stringify({ id, op: 'read', text })}\n`))
  child.stdin.end()
  await done
  const answers = new Map<number, Lemmas>()
  for (const line of out.trim().split('\n')) {
    const one = JSON.parse(line) as { id: number; roots?: Lemmas }
    answers.set(one.id, one.roots ?? {})
  }
  return texts.map((_, id) => answers.get(id) ?? {})
}

/** The names Apple's Natural Language picks out of each text. */
async function namesOf(texts: string[]): Promise<{ text: string; kind: string }[][]> {
  const child = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  let out = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => (out += chunk))
  const done = new Promise((resolve) => child.on('close', resolve))
  texts.forEach((text, id) => child.stdin.write(`${JSON.stringify({ id, op: 'read', text })}\n`))
  child.stdin.end()
  await done
  const answers = new Map<number, { text: string; kind: string }[]>()
  for (const line of out.trim().split('\n')) {
    const one = JSON.parse(line) as { id: number; names?: { text: string; kind: string }[] }
    answers.set(one.id, one.names ?? [])
  }
  return texts.map((_, id) => answers.get(id) ?? [])
}

/** Each text's meaning fingerprint (Apple's sentence embedding), for the tie-break. */
async function meaningsOf(texts: string[]): Promise<(Float32Array | null)[]> {
  const child = spawn(HELPER, [], { stdio: ['pipe', 'pipe', 'ignore'] })
  let out = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => (out += chunk))
  const done = new Promise((resolve) => child.on('close', resolve))
  child.stdin.write(`${JSON.stringify({ id: 1, op: 'embed', texts })}\n`)
  child.stdin.end()
  await done
  const vectors = (JSON.parse(out.trim().split('\n')[0]) as { vectors: (string | null)[] }).vectors
  return vectors.map((one) => (one ? new Float32Array(Buffer.from(one, 'base64').buffer.slice(0)) : null))
}
const near = (a: Float32Array | null, b: Float32Array | null): number => {
  if (!a || !b) return 0
  let dot = 0, x = 0, y = 0
  for (let i = 0; i < a.length; i++) (dot += a[i] * b[i]), (x += a[i] * a[i]), (y += b[i] * b[i])
  return dot / (Math.sqrt(x * y) || 1)
}

const rate = (right: number, made: number): number => (made ? right / made : 1)
const pc = (n: number): string => `${Math.round(n * 100)}%`

test('each offer by shared root words is right at least 4 times in 5', { skip: process.platform !== 'darwin' }, async () => {
  const notes = book()
  assert.equal(notes.length, 200)
  // The Mac reads the roots and the meanings in two helpers at once: neither waits on the other.
  const [lemmas, meanings] = await Promise.all([lemmasOf(notes.map((one) => `${one.title} ${one.text}`)), meaningsOf(notes.map((one) => `${one.title}. ${one.text}`))])
  const index = new RootIndex(notes.map((one, i) => ({ key: one.key, title: one.title, text: one.text, lemmas: lemmas[i] })))
  const byKey = new Map(notes.map((one) => [one.key, one]))
  const meaningOf = new Map(notes.map((one, i) => [one.key, meanings[i]]))
  const rows: string[] = []
  const result: Record<string, number> = {}
  const say = (name: string, right: number, made: number, cases: number, reached: number): void => {
    result[name] = rate(right, made)
    rows.push(`${name.padEnd(28)} precision ${pc(rate(right, made)).padStart(4)} (${right} of ${made} offers right)   reach ${pc(rate(reached, cases)).padStart(4)} (${reached} of ${cases})`)
  }

  // Links suggest themselves: a titled note's title named in another note's words, of the same subject.
  const titled = new Set(notes.filter((one) => one.key.includes('-title-')).map((one) => one.key))
  let made = 0, right = 0, cases = 0, reached = 0
  notes.forEach((note, i) => {
    const offers = linksIn(index, note.text, lemmas[i], note.key).filter((one) => titled.has(one.key))
    made += offers.length
    right += offers.filter((one) => byKey.get(one.key)!.topic === note.topic).length
  })
  // Reach: notes that name a title of their own subject in its own words.
  notes.forEach((note, i) => {
    const own = TOPICS.find((one) => one.folder === note.topic)?.titles ?? []
    const named = own.some((title) => note.text.toLowerCase().includes(title.toLowerCase()))
    if (!named) return
    cases++
    if (linksIn(index, note.text, lemmas[i], note.key).some((one) => titled.has(one.key) && byKey.get(one.key)!.topic === note.topic)) reached++
  })
  say('Links suggest themselves', right, made, cases, reached)

  // You already wrote this: only a near-copy is offered its original (or the other way about).
  made = 0; right = 0; cases = 0; reached = 0
  notes.forEach((note, i) => {
    const hit = alreadyWrote(index, note.text, lemmas[i], note.key, (key) => near(meanings[i], meaningOf.get(key)!))
    // Its copy written later, or a note that came out word for word the same.
    const twins = new Set([note.copyOf, ...notes.filter((one) => one.copyOf === note.key || (one.key !== note.key && one.text === note.text)).map((one) => one.key)].filter(Boolean))
    if (twins.size) cases++
    if (!hit) return
    made++
    if (twins.has(hit.key)) (right++, reached++)
    else if (process.env.WHY) console.log('SAME wrong', hit.score.toFixed(2), '|', note.text, '||', byKey.get(hit.key)!.text)
  })
  say('You already wrote this', right, made, cases, reached)

  // Which folder?: a loose note of a subject offered that subject's folder; everyday notes offered none.
  const folders = new Map<string, string[]>()
  for (const note of notes) if (note.folder) folders.set(note.folder, [...(folders.get(note.folder) ?? []), note.key])
  made = 0; right = 0; cases = 0; reached = 0
  for (const note of notes.filter((one) => !one.folder)) {
    if (note.topic) cases++
    const hit = whichFolder(index, note.key, folders)
    if (!hit) continue
    made++
    if (hit.folder === note.topic) (right++, reached++)
  }
  say('Which folder?', right, made, cases, reached)

  // Tags from your own notes: what a note lacks of the tags its subject's notes carry, offered from the notes nearest it.
  const tags = tagsOfBook(notes)
  const tagged = notes.map((one) => [one.text, ...tags.get(one.key)!.has.map((tag) => `#${tag}`)].join(' '))
  const tagIndex = new RootIndex(notes.map((one, i) => ({ key: one.key, title: one.title, text: tagged[i], lemmas: lemmas[i] })))
  made = 0; right = 0; cases = 0; reached = 0
  notes.forEach((note, i) => {
    const { has, right: should } = tags.get(note.key)!
    const lacks = should.filter((tag) => !has.includes(tag))
    if (lacks.length) cases++
    const offers = tagsNear(tagIndex, tagged[i], lemmas[i], note.key, (key) => tags.get(key)!.has, new Set(has), (key) => near(meanings[i], meaningOf.get(key)!))
    made += offers.length
    const good = offers.filter((one) => lacks.includes(one.tag)).length
    right += good
    if (good) reached++
    if (process.env.WHY) for (const one of offers) if (!lacks.includes(one.tag)) console.log('TAG wrong', one.tag, `${one.notes} of ${one.of}`, '|', note.text)
  })
  say('Tags from your own notes', right, made, cases, reached)

  // A clue for your question, and notes before an event: each offered note of the asked subject.
  const asked = TOPICS.flatMap((topic) => [...topic.questions.map((text) => ({ text, topic: topic.folder, kind: 'clue' })), ...topic.events.map((text) => ({ text, topic: topic.folder, kind: 'event' }))])
  // Everyday events: the note about that very thing is the right one ("Lunch with Ana" and the note on lunch with Ana).
  const everyday = ([['Dentist', 'life-3'], ['Call with the bank', null], ['Lunch with Ana', 'life-4'], ['Car service', 'life-10'], ['Parents’ evening', 'life-19']] as const).map(([text, key]) => ({ text, topic: key ? `life:${key}` : null, kind: 'event' }))
  const all = [...asked, ...everyday]
  const [askedLemmas, askedMeanings] = await Promise.all([lemmasOf(all.map((one) => one.text)), meaningsOf(all.map((one) => one.text))])
  for (const kind of ['clue', 'event']) {
    made = 0; right = 0; cases = 0; reached = 0
    all.forEach((one, i) => {
      if (one.kind !== kind) return
      if (one.topic) cases++
      const offers = cluesFor(index, one.text, askedLemmas[i], undefined, (key) => near(askedMeanings[i], meaningOf.get(key)!))
      made += offers.length
      const fits = (key: string): boolean => (one.topic?.startsWith('life:') ? key === one.topic.slice(5) : byKey.get(key)!.topic === one.topic)
      const good = one.topic ? offers.filter((hit) => fits(hit.key)).length : 0
      right += good
      if (process.env.WHY) for (const hit of offers) if (!one.topic || !fits(hit.key)) console.log(kind, 'wrong', hit.score.toFixed(2), one.text, '=>', byKey.get(hit.key)!.text)
      if (good) reached++
    })
    say(kind === 'clue' ? 'A clue for your question' : 'Notes at the right moment', right, made, cases, reached)
  }
  // People named, offered to People: every line of the book read once, each name it offers checked against who is really a person.
  const PEOPLE = new Set(['Marcus Aurelius', 'Marcus', 'Epictetus', 'Seneca', 'Lucilius', 'Zeno', 'Paul Atreides', 'Paul', 'Herbert', 'Jessica', 'Lady Jessica', 'Chani', 'Villeneuve', 'Baron Harkonnen', 'Leonardo da Vinci', 'Leonardo', 'Brunelleschi', 'Lorenzo', 'Michelangelo', 'Botticelli', 'Vasari', 'Hawking', 'Ana', 'Sam', 'Muad\u2019Dib', 'Dad'])
  const words = new Set(readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((one) => one && one === one.toLowerCase()))
  const lines = [...TOPICS.flatMap((topic) => [...topic.lines, ...topic.questions, ...topic.events]), ...LOOSE_LIFE, ...FRAMES]
  const named = await namesOf(lines)
  const offered = named.flatMap((names) => peopleIn(names, (word) => words.has(word)))
  say('People named (to People)', offered.filter((one) => PEOPLE.has(one)).length, offered.length, [...PEOPLE].filter((one) => lines.some((line) => line.includes(one))).length, new Set(offered.filter((one) => PEOPLE.has(one))).size)
  if (process.env.WHY) console.log('people wrong', offered.filter((one) => !PEOPLE.has(one)))
  console.log(`\n${rows.join('\n')}\n`)
  for (const [name, precision] of Object.entries(result)) assert.ok(precision >= 0.8, `${name}: ${pc(precision)}`)
  // Offered as you write a new note, a wrong tag is written into your words: the bar is 9 in 10.
  assert.ok(result['Tags from your own notes'] >= 0.9, `Tags from your own notes: ${pc(result['Tags from your own notes'])}`)
})

test('a field named by its people is its note: “the Stoics” names “Stoicism”, “cells” never names “Cell biology” alone', () => {
  const notes = [{ key: 'a', title: 'Stoicism', text: 'Virtue is the only good.' }, ...Array.from({ length: 30 }, (_, i) => ({ key: `n${i}`, title: `Note ${i}`, text: `Some everyday words number ${i}, the kettle and the garden.` }))]
  const index = new RootIndex(notes)
  assert.deepEqual(linksIn(index, 'The Stoics held that only our judgements are up to us.', {}, 'x').map((one) => one.title), ['Stoicism'])
  assert.deepEqual(linksIn(index, 'A stoicist would shrug.', {}, 'x').map((one) => one.title), ['Stoicism'])
})
