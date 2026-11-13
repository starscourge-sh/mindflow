// Run with: node --test test/sandbox-credits.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { STORIES } from '../src/renderer/src/lib/welcome-stories.ts'

// The app is sold: every picture that ships with the example book is public domain or CC0, and says so in SOURCES.txt.
const folder = new URL('../src/renderer/src/assets/sandbox/', import.meta.url)
const credits = readFileSync(new URL('SOURCES.txt', folder), 'utf8')
const seed = readFileSync(new URL('../src/renderer/src/lib/sandbox-seed.ts', import.meta.url), 'utf8')

test('every picture bundled with the example book is credited in SOURCES.txt', () => {
  const pictures = readdirSync(folder).filter((one) => one.endsWith('.webp'))
  assert.ok(pictures.length > 40)
  for (const file of pictures) assert.ok(credits.includes(file), `${file} is not named in SOURCES.txt`)
})

test('every picture the seed asks that folder for is in it', () => {
  const asked = [...seed.matchAll(/from '@\/assets\/sandbox\/([^']+)'/g)].map((hit) => hit[1])
  assert.ok(asked.length > 40)
  for (const file of asked) assert.ok(existsSync(new URL(file, folder)), `${file} is asked for and is not there`)
})

test('whoever says a welcome story\'s line is a character in the example book, never one of its People', () => {
  const speakers = /const speakers:[^\n]*= \{\n([\s\S]*?)\n  \}/.exec(seed)?.[1] ?? ''
  for (const one of STORIES) {
    // Kept as a character of that work already (the creature, in Frankenstein), or given a line as the story's speaker.
    const kept = seed.includes(`['${one.quote.who}', '${one.book}', `)
    assert.ok(kept || new RegExp(`^\\s+${one.id}: \\['`, 'm').test(speakers), `${one.quote.who} (the ${one.id} story) would be listed among People`)
    assert.equal(one.quote.where, one.book, 'the work a speaker is in is the story\'s book')
  }
})

test('the words written for the example book\'s people have no em or en dash', () => {
  const people = /const people:[^\n]*= \[\n([\s\S]*?)\n  \]/.exec(seed)?.[1] ?? ''
  assert.ok(people.includes('Homer') && people.includes('Frank Herbert'))
  assert.doesNotMatch(people, /[–—]/)
})
