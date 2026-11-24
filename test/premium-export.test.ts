// Run with: node --test test/premium-export.test.ts
// The export is a folder of the book: folders, a gem linked both ways, a deck, a highlight, a readme.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { layoutBook } from '../src/main/premium-export.ts'

const render = (body: unknown, nameOf: (id: string) => string | undefined, assets: string): string =>
  String(body ?? '').replace(/\[\[id:([^\]]+)\]\]/g, (_, id: string) => `[[${nameOf(id) ?? id}]]`).replaceAll('ASSET/', assets)

test('a book exports as folders, with gems, a deck, highlights and a readme', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    create table note_groups (id text, list text, name text, parent_id text, folder integer);
    create table captures (id text, title text, body text, kind text, status text, private integer, captured_at text, attribution text, medium text, fields text, folder_id text);
    create table nuggets (id text, tier text, title text, body text, prompt text, kind text, private integer, created_at text, attribution text, capture_id text, folder_id text, deck text, fields text, binned_at text, superseded_by text);
    create table pdf_highlights (id text, src text, page integer, quote text, note text, gem_id text);
  `)
  db.prepare('insert into note_groups values (?, ?, ?, ?, ?)').run('films', 'folders', 'Films', null, 1)
  db.prepare('insert into note_groups values (?, ?, ?, ?, ?)').run('seen', 'folders', 'Seen', 'films', 1)
  db.prepare('insert into captures values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cap', 'A loose note', 'Just the words.', 'note', 'open', 0, '2026-11-01', null, null, null, null)
  db.prepare('insert into nuggets values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('page', 'article', 'On colour', 'See [[id:cap]] and ASSET/pic.png', null, 'note', 0, '2026-11-02', null, null, 'seen', null, null, null, null)
  db.prepare('insert into nuggets values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('gem', 'nugget', 'A kept line', 'The line itself.', null, 'quote', 0, '2026-11-03', null, 'cap', null, null, null, null, null)
  db.prepare('insert into nuggets values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('card', 'card', '', 'A small room.', 'What is a cell?', 'card', 0, '2026-11-04', null, null, null, 'biology', null, null, null)
  db.prepare('insert into pdf_highlights values (?, ?, ?, ?, ?, ?)').run('h1', 'books/colour.pdf', 12, 'Colour is a sensation.', 'Mine.', 'gem')
  const { files, preview } = layoutBook(db, render)
  const page = files.get('Writing/Films/Seen/On colour.md') ?? ''
  const note = files.get('Notes/A loose note.md') ?? ''
  const gem = files.get('Gems/A kept line.md') ?? ''
  const deck = files.get('Decks/biology.md') ?? ''
  const library = [...files.keys()].find((path) => path.startsWith('Library/'))
  assert.match(page, /See \[\[A loose note\]\]/)
  assert.match(page, /\.\.\/\.\.\/\.\.\/assets\/pic\.png/)
  assert.match(note, /## Backlinks[\s\S]*\[\[On colour\]\]/)
  assert.match(gem, /Kept from \[\[A loose note\]\]/)
  assert.match(note, /## Backlinks[\s\S]*\[\[A kept line\]\]/)
  assert.match(deck, /> \[!card\]- What is a cell\?/)
  assert.match(deck, /> A small room\./)
  assert.match(files.get(library!) ?? '', /p\. 12/)
  assert.match(files.get(library!) ?? '', /Kept as \[\[A kept line\]\]/)
  assert.match(files.get('README.md') ?? '', /1 pages, 1 gems, 1 notes, 1 decks, 1 sources/)
  assert.equal(preview.pages, 1)
  assert.equal(preview.gems, 1)
  assert.equal(preview.decks, 1)
  assert.equal(preview.sample[0].path, 'README.md')
  db.close()
})
