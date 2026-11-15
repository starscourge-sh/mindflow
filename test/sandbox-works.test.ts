// Run with: node --test test/sandbox-works.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STORIES } from '../src/renderer/src/lib/welcome-stories.ts'

// The example book's works are kept whole from the start (sandbox-seed.ts, `works`): a kind, an author and a line each,
// so opening one asks Wikipedia nothing. qa/sandbox-works.mjs opens every one; this keeps a new story from slipping by.
const seed = readFileSync(new URL('../src/renderer/src/lib/sandbox-seed.ts', import.meta.url), 'utf8')
const works = /const works: [^\n]*= \[\n([\s\S]*?)\n {2}\]/.exec(seed)?.[1] ?? ''
const rows = [...works.matchAll(/^\s+\[('(?:[^'\\]|\\.)*'|"[^"]*"|\w+\([^)]*\)), '([^']*)', '(\d{0,4})', '([^']*)', '(.+)'\],?$/gm)]

test('every welcome story\'s book is kept whole in the example book, so its page asks Wikipedia nothing', () => {
  assert.ok(rows.length > 25, `${rows.length} works read from the seed`)
  for (const one of STORIES) assert.ok(rows.some((row) => row[1] === `'${one.quote.where}'`), `${one.quote.where} (the ${one.id} story) has no kind, year or line in the seed`)
})

test('each work kept has a kind and a line; a year, when given, is one year', () => {
  for (const [, where, kind, year, , line] of rows) {
    assert.ok(kind.trim(), `${where} has no kind`)
    assert.ok(line.length > 20, `${where} has no line`)
    assert.ok(!year || /^\d{3,4}$/.test(year), `${where}: "${year}" is not one year`)
  }
})
