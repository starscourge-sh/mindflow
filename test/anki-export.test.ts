// Run with: node --test test/anki-export.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync } from 'fflate'
import { asHtml, deckPackage } from '../src/main/anki-export.ts'

test('a deck as an .apkg: one Basic note a card, fields named as its sides, in a deck of its name, pictures packed', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'apkg-test-'))
  try {
    const picture = join(folder, 'cat.png')
    writeFileSync(picture, 'not really a png')
    const bytes = await deckPackage('Spanish', ['English', 'Spanish'], [
      { front: 'cat', back: 'gato <img src="cat.png">', tags: ['spanish'], pictures: [{ name: 'cat.png', file: picture }] },
      { front: asHtml('<b> & "hello"'), back: 'hola', tags: [], pictures: [] }
    ])
    const files = unzipSync(bytes)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(files.media)), { 0: 'cat.png' })
    assert.equal(new TextDecoder().decode(files['0']), 'not really a png')
    writeFileSync(join(folder, 'c.anki2'), files['collection.anki2'])
    const db = new DatabaseSync(join(folder, 'c.anki2'), { readOnly: true })
    const notes = db.prepare('select flds, tags, mid from notes order by id').all() as { flds: string; tags: string; mid: number }[]
    const col = db.prepare('select models, decks from col').get() as { models: string; decks: string }
    const cards = db.prepare('select nid, did, type, queue from cards').all() as { nid: number; did: number; type: number; queue: number }[]
    db.close()
    assert.equal(notes.length, 2)
    assert.deepEqual(notes[0].flds.split('\x1f'), ['cat', 'gato <img src="cat.png">'])
    assert.equal(notes[0].tags, ' spanish ')
    assert.equal(notes[1].flds.split('\x1f')[0], '&lt;b&gt; &amp; "hello"')
    const model = Object.values(JSON.parse(col.models))[0] as { flds: { name: string }[]; tmpls: { qfmt: string }[] }
    assert.deepEqual(model.flds.map((one) => one.name), ['English', 'Spanish'])
    assert.equal(model.tmpls[0].qfmt, '{{English}}')
    const decks = JSON.parse(col.decks) as Record<string, { name: string }>
    assert.ok(Object.values(decks).some((one) => one.name === 'Spanish'))
    assert.equal(cards.length, 2)
    assert.ok(cards.every((one) => one.type === 0 && one.queue === 0 && decks[String(one.did)].name === 'Spanish'))
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
