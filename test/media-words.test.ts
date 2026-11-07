// Run with: node --test test/media-words.test.ts
// What Files takes is read from a file's first bytes, and every way in says one sentence about a batch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSaid, sniff, whyNot } from '../src/main/media-words.ts'

const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'))
const none = { added: [], revived: [], met: [], refused: [] }
const file = (name: string) => ({ src: `haligtree://assets/x`, name, size: 1, kind: 'pdf' as const })

test('a file is known by its bytes, whatever it is called', () => {
  assert.deepEqual(sniff(bytes('\x89PNG\r\n'), 'holiday.jpeg'), { end: 'png', kind: 'picture' })
  assert.deepEqual(sniff(bytes('\xff\xd8\xff\xe0'), 'a.jpeg'), { end: 'jpg', kind: 'picture' })
  assert.deepEqual(sniff(bytes('GIF89a'), 'noending'), { end: 'gif', kind: 'gif' })
  assert.deepEqual(sniff(bytes('%PDF-1.7'), 'BOOK.PDF'), { end: 'pdf', kind: 'pdf' })
  assert.deepEqual(sniff(bytes('ID3\x04'), 'song.mp3'), { end: 'mp3', kind: 'audio' })
  assert.deepEqual(sniff(bytes('RIFF....WAVEfmt '), 'bird.wav'), { end: 'wav', kind: 'audio' })
})

test('what it cannot take is refused, and says why in words', () => {
  assert.equal(sniff(bytes('hello'), 'fake.png'), null)
  assert.equal(sniff(bytes('hello'), 'fake.mp3'), null)
  assert.equal(sniff(bytes('....ftypisom'), 'film.mp4'), null)
  assert.equal(whyNot('fake.png'), 'not a picture Haligtree can read')
  assert.equal(whyNot('fake.pdf'), 'not a PDF Haligtree can read')
  assert.equal(whyNot('notes.docx'), 'only pictures, GIFs, PDFs and audio go in Files')
})

test('one sentence for a batch: numbers say what they count, names are named', () => {
  assert.equal(addSaid({ ...none, added: [file('Lease.pdf')] }), 'Added “Lease” to Files.')
  assert.equal(addSaid({ ...none, added: [file('a.pdf'), file('b.pdf')], revived: [file('c.pdf')] }), 'Added 3 files.')
  assert.equal(addSaid({ ...none, met: [file('Lease.pdf')] }), '“Lease” is already in Files.')
  assert.equal(addSaid({ ...none, met: [file('a.pdf'), file('b.pdf')] }), 'All 2 are already in Files.')
  assert.equal(addSaid({ ...none, added: [file('a.pdf'), file('b.pdf')], met: [file('c.pdf'), file('d.pdf')] }), 'Added 2 files. 2 were already there.')
  assert.equal(addSaid({ ...none, refused: [{ name: 'x.docx', why: 'only pictures, GIFs, PDFs and audio go in Files' }] }), 'x.docx: only pictures, GIFs, PDFs and audio go in Files.')
  assert.match(addSaid({ ...none, refused: Array.from({ length: 5 }, (_, n) => ({ name: `${n}.doc`, why: 'no' })) }), /And 2 more not added\.$/)
})
