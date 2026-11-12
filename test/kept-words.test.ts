// Run with: node --test test/kept-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keptTagged, linesIn, linesOf, readKept, startOf, stillBase, textOf, wordsOf } from '../src/main/kept-words.ts'
import { tagged } from '../src/main/kinds.ts'

const doc = (...lines: string[]): unknown => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
/** Words as an editor hands them over: the document written out, as UTF-8 bytes. */
const kept = (body: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(body))

test('the same words: letter for letter, from an editor (bytes) or a document written out here', () => {
  const stored = JSON.stringify(doc('Fear is the mind-killer', 'naïve café, 日本語, 📚'))
  assert.equal(stillBase(stored, kept(doc('Fear is the mind-killer', 'naïve café, 日本語, 📚'))), true)
  assert.equal(stillBase(stored, stored), true)
})

test('the same words kept with other spacing, or in another order of writing out, are still the base', () => {
  const stored = '{ "type": "doc",\n  "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "One" } ] } ] }'
  assert.equal(stillBase(stored, kept(doc('One'))), true)
})

test('one letter written elsewhere since: no longer the base', () => {
  const stored = JSON.stringify(doc('One', 'Two'))
  assert.equal(stillBase(stored, kept(doc('One', 'Two!'))), false)
  assert.equal(stillBase(stored, kept(doc('One'))), false)
  // The same letters in another block are other words.
  assert.equal(stillBase(JSON.stringify(doc('OneTwo')), kept(doc('One', 'Two'))), false)
})

test('nothing stored is the base "null", and words that are not a document are themselves', () => {
  assert.equal(stillBase(null, kept(null)), true)
  assert.equal(stillBase(undefined, 'null'), true)
  assert.equal(stillBase(null, kept(doc('One'))), false)
  // Markdown from an import is kept as a JSON string; text that is no JSON at all reads as itself.
  assert.equal(stillBase(JSON.stringify('# A page\n\nwords'), kept('# A page\n\nwords')), true)
  assert.equal(readKept('not json'), 'not json')
  assert.equal(stillBase('not json', kept('not json')), true)
})

test('a save says its words either way, and both come out as they are kept', () => {
  const body = doc('One')
  const fromEditor = wordsOf({ words: kept(body), wordsBase: kept(doc('Was')) })
  const fromDocument = wordsOf({ body, base: doc('Was') })
  assert.equal(textOf(fromEditor.kept!), textOf(fromDocument.kept!))
  assert.equal(textOf(fromEditor.base!), textOf(fromDocument.base!))
  // The editor's bytes are handed on as they came, not copied or read.
  const bytes = kept(body)
  assert.equal(wordsOf({ words: bytes }).kept, bytes)
  assert.deepEqual(wordsOf({ title: 'no words' } as never), { kept: null, base: null })
  assert.equal(wordsOf({ body: null }).kept, 'null')
})

test('a meeting in its old shape is folded on the way in, from bytes as from a document; a page keeps its words as they come', () => {
  const old = { type: 'doc', content: [{ type: 'meeting', attrs: { lines: [] } }, { type: 'meetingLine', attrs: { who: 'you', at: 3, end: 5 }, content: [{ type: 'text', text: 'Send the designs' }] }] }
  const folded = JSON.parse(textOf(wordsOf({ words: kept(old) }).kept!)) as { content: { type: string; attrs: { lines: { text: string }[] } }[] }
  assert.deepEqual(folded.content.map((one) => one.type), ['meeting'])
  assert.equal(folded.content[0].attrs.lines[0].text, 'Send the designs')
  assert.equal(textOf(wordsOf({ body: old }).kept!), textOf(wordsOf({ words: kept(old) }).kept!))
  assert.equal(textOf(wordsOf({ words: kept(old) }, false).kept!), JSON.stringify(old))
  // The words "meetingLine" written in a note are not a meeting's line.
  const said = kept(doc('the type is "meetingLine" here'))
  assert.equal(wordsOf({ words: said }).kept, said)
})

test('#tag is asked of bytes exactly as of text', () => {
  const cases = ['#bit', 'a joke #bit', 'a joke #Bit here', '#BIT', 'no tag', '#bits and #bitter', 'email#bit', 'x #bit.', 'x #bit—dash', 'x #bité', 'x #bit📚', 'tab\t#bit', 'nbsp #bit', 'wide　#bit', 'line\n#bit', '## heading #bi t', 'x #bit_y', 'x #bit-y', '#b', '#']
  for (const words of cases) {
    for (const stored of [JSON.stringify(doc(words)), JSON.stringify(words), words]) {
      assert.equal(keptTagged(new TextEncoder().encode(stored), 'bit'), tagged(stored, 'bit'), JSON.stringify(stored))
      assert.equal(keptTagged(stored, 'bit'), tagged(stored, 'bit'), JSON.stringify(stored))
    }
  }
  // A tag with a letter /i takes in another spelling (the Kelvin sign for k) is still found.
  assert.equal(keptTagged(new TextEncoder().encode('x #booK'), 'book'), tagged('x #booK', 'book'))
  assert.equal(keptTagged(new TextEncoder().encode('x #Book'), 'book'), true)
})

test('the start of a long document: its whole first blocks, read from the start of its text alone', () => {
  const body = doc('First line "with quotes", a brace } and a bracket ]', 'Second \\ line', ...Array.from({ length: 400 }, (_, n) => `filler line ${n}`)) as { content: unknown[] }
  const start = startOf(JSON.stringify(body), 300) as { type: string; content: unknown[] }
  assert.equal(start.type, 'doc')
  assert.ok(start.content.length >= 2 && start.content.length < 402, String(start.content.length))
  assert.deepEqual(start.content, body.content.slice(0, start.content.length))
  // Not a document as the editor writes one, a first block longer than the start, or no block at all: nothing.
  assert.equal(startOf(JSON.stringify('# Markdown, kept as text'), 300), null)
  assert.equal(startOf(JSON.stringify(doc('x'.repeat(500))), 300), null)
  assert.equal(startOf('{"type":"doc","content":[]}', 300), null)
  assert.equal(startOf('{"content":[],"type":"doc"}', 300), null)
})

test('the lines that are cards, and the tags that go on them, read out of stored words', () => {
  const stored = JSON.stringify(doc('Biology #biology', 'What carries oxygen :: Haemoglobin', 'std::vector is no card', 'Powerhouse of the cell :: Mitochondria'))
  assert.deepEqual(linesOf(stored), { lines: [{ question: 'What carries oxygen', answer: 'Haemoglobin' }, { question: 'Powerhouse of the cell', answer: 'Mitochondria' }], tags: '#biology' })
  assert.deepEqual(linesOf(stored), linesIn(JSON.parse(stored)))
  // Markdown kept as text, nothing stored, and a note with no card: no lines, and no tags worked out.
  assert.deepEqual(linesOf(JSON.stringify('Capital of France :: Paris\n\n#geo')), { lines: [{ question: 'Capital of France', answer: 'Paris' }], tags: '#geo' })
  assert.deepEqual(linesOf(null), { lines: [], tags: '' })
  assert.deepEqual(linesOf(JSON.stringify(doc('Just words #tag'))), { lines: [], tags: '' })
})
