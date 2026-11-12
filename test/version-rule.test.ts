// Run with: node --test test/version-rule.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { LETTERS_UNDER, versionRule } from '../src/main/version-rule.ts'

/** A book with the rule's trigger on it, and one note that kept a version a moment ago (so only "a lot went at once" can keep another). */
function book(rule: string, body: string): { save: (next: string) => number; bytes: number } {
  const db = new DatabaseSync(':memory:')
  db.exec('create table captures (id text primary key, body text); create table versions (id integer primary key autoincrement, item_id text not null, body text, saved_at text not null)')
  db.exec(`create trigger captures_versions before update of body on captures ${rule}`)
  db.prepare('insert into captures (id, body) values (?, ?)').run('n', body)
  db.prepare("insert into versions (item_id, body, saved_at) values ('n', 'earlier', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))").run()
  const count = (): number => (db.prepare("select count(*) as n from versions where item_id = 'n'").get() as { n: number }).n
  return {
    save: (next) => {
      const before = count()
      db.prepare("update captures set body = ? where id = 'n'").run(next)
      return count() - before
    },
    bytes: Buffer.byteLength(body)
  }
}
const rule = versionRule('old.id')
/** The rule as it stood for a day (12 Nov): bytes for every note. */
const bytesOnly = rule.replace(/case when .* then (.*) else (.*) end\)/, '$2)')
const BOOK = '📚'
const mixed = (emoji: number, letters: number): string => BOOK.repeat(emoji) + 'a'.repeat(letters)

test('the rule is made of both ways of counting, and the bytes-only one is cut out of it for these tests', () => {
  assert.match(rule, /case when length\(cast\(old\.body as blob\)\) < 200000 then coalesce\(length\(new\.body\), 0\) < length\(old\.body\) \* 0\.6/)
  assert.doesNotMatch(bytesOnly, /case when/)
  assert.match(bytesOnly, /or coalesce\(length\(cast\(new\.body as blob\)\), 0\) < length\(cast\(old\.body as blob\)\) \* 0\.6/)
})

test('under the line, a note of mixed scripts: 45% of its letters cut is under 60% in letters, and a version is kept', () => {
  // 250 emoji and 250 plain letters: 500 letters, 1,250 bytes. 225 plain letters go: 55% of the letters stay, 82% of the bytes.
  const note = book(rule, mixed(250, 250))
  assert.ok(note.bytes < LETTERS_UNDER)
  assert.equal(note.save(mixed(250, 25)), 1)
  // Counted in bytes, that cut kept none: the version the note would have lost.
  assert.equal(book(bytesOnly, mixed(250, 250)).save(mixed(250, 25)), 0)
})

test('under the line, a few letters typed or taken keep no second version inside ten minutes', () => {
  const note = book(rule, mixed(250, 250))
  assert.equal(note.save(mixed(250, 260)), 0)
  assert.equal(note.save(mixed(250, 240)), 0)
})

test('past the line, a note of mixed scripts: a cut of 45% of its letters is far past a paragraph, and a version is kept', () => {
  // 60,000 emoji and 60,000 plain letters: 120,000 letters, 300,000 bytes.
  const note = book(rule, mixed(60_000, 60_000))
  assert.ok(note.bytes > LETTERS_UNDER)
  assert.equal(note.save(mixed(60_000, 6_000)), 1)
  // And a paste over the lot.
  assert.equal(book(rule, mixed(60_000, 60_000)).save('gone'), 1)
})

test('past the line, a few letters typed or taken keep no second version inside ten minutes', () => {
  const note = book(rule, mixed(60_000, 60_000))
  assert.equal(note.save(mixed(60_000, 60_100)), 0)
  assert.equal(note.save(mixed(60_000, 59_900)), 0)
})

test('past the line it is bytes that are counted: letters swapped for wider ones count as smaller than they are', () => {
  // 500 plain letters out, 125 emoji in: 375 letters fewer (a paragraph and more), the same bytes. Letters would keep a version.
  assert.equal(book(rule, mixed(60_000, 60_000)).save(mixed(60_125, 59_500)), 0)
  // Under the line the same swap, in letters, keeps one.
  assert.equal(book(rule, mixed(2_000, 2_000)).save(mixed(2_125, 1_500)), 1)
})

test('with no version in the last ten minutes, any change keeps one, on either side of the line', () => {
  for (const body of [mixed(250, 250), mixed(60_000, 60_000)]) {
    const db = new DatabaseSync(':memory:')
    db.exec('create table captures (id text primary key, body text); create table versions (id integer primary key autoincrement, item_id text not null, body text, saved_at text not null)')
    db.exec(`create trigger captures_versions before update of body on captures ${rule}`)
    db.prepare('insert into captures (id, body) values (?, ?)').run('n', body)
    db.prepare("update captures set body = ? where id = 'n'").run(`${body}!`)
    assert.equal((db.prepare('select body from versions').get() as { body: string }).body, body)
  }
})
