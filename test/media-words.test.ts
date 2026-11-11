// Run with: node --test test/media-words.test.ts
// What Files takes is read from a file's first bytes, and every way in says one sentence about a batch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSaid, sniff } from '../src/main/media-words.ts'

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

test('a video is known by its bytes and its ending', () => {
  assert.deepEqual(sniff(bytes('....ftypisom'), 'film.mp4'), { end: 'mp4', kind: 'video' })
  assert.deepEqual(sniff(bytes('....moov'), 'Holiday.MOV'), { end: 'mov', kind: 'video' })
  assert.deepEqual(sniff(bytes('....ftypM4V '), 'show.m4v'), { end: 'm4v', kind: 'video' })
  assert.deepEqual(sniff(bytes('\x1a\x45\xdf\xa3'), 'screen.webm'), { end: 'webm', kind: 'video' })
  assert.deepEqual(sniff(bytes('\x1a\x45\xdf\xa3'), 'voice.weba'), { end: 'weba', kind: 'audio' })
})

test('anything else is kept as a document, under its own ending', () => {
  assert.deepEqual(sniff(bytes('PK\x03\x04'), 'Essay.DOCX'), { end: 'docx', kind: 'document' })
  assert.deepEqual(sniff(bytes('PK\x03\x04'), 'sources.zip'), { end: 'zip', kind: 'document' })
  assert.deepEqual(sniff(bytes('name,mark'), 'marks.csv'), { end: 'csv', kind: 'document' })
  assert.deepEqual(sniff(bytes('hello'), 'README'), { end: 'bin', kind: 'document' })
  assert.deepEqual(sniff(bytes('hello'), 'odd name.with spaces'), { end: 'bin', kind: 'document' })
  // Named as a picture, a recording or a film but not one inside: a plain file, never shown as what its name says.
  assert.deepEqual(sniff(bytes('hello'), 'fake.png'), { end: 'bin', kind: 'document' })
  assert.deepEqual(sniff(bytes('hello'), 'fake.mp3'), { end: 'bin', kind: 'document' })
  assert.deepEqual(sniff(bytes('hello'), 'fake.mp4'), { end: 'bin', kind: 'document' })
})

test('one sentence for a batch: numbers say what they count, names are named', () => {
  assert.equal(addSaid({ ...none, added: [file('Lease.pdf')] }), 'Added “Lease” to Files.')
  assert.equal(addSaid({ ...none, added: [file('a.pdf'), file('b.pdf')], revived: [file('c.pdf')] }), 'Added 3 files.')
  assert.equal(addSaid({ ...none, met: [file('Lease.pdf')] }), '“Lease” is already in Files.')
  assert.equal(addSaid({ ...none, met: [file('a.pdf'), file('b.pdf')] }), 'All 2 are already in Files.')
  assert.equal(addSaid({ ...none, added: [file('a.pdf'), file('b.pdf')], met: [file('c.pdf'), file('d.pdf')] }), 'Added 2 files. 2 were already there.')
  assert.equal(addSaid({ ...none, refused: [{ name: 'Notes', why: 'a folder, so pick the files in it' }] }), 'Notes: a folder, so pick the files in it.')
  assert.match(addSaid({ ...none, refused: Array.from({ length: 5 }, (_, n) => ({ name: `${n}.doc`, why: 'no' })) }), /And 2 more not added\.$/)
})
