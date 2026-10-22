// Run with: node --test test/embeds.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barePath, cleanRef, embedsIn, nameOf, onlyEmbeds, tailOf } from '../src/main/embeds.ts'

test('![[name.png]] and its width', () => {
  assert.deepEqual(embedsIn('![[cat.png]]'), [{ from: 0, to: 12, ref: 'cat.png', width: undefined }])
  assert.equal(embedsIn('![[cat.png|300]]')[0].width, '300')
  assert.equal(embedsIn('![[cat.png|300x200]]')[0].width, '300')
  assert.equal(embedsIn('![[cat.png|a cat]]')[0].width, undefined)
  assert.equal(embedsIn('| ![[cat.png\\|300]] |')[0].ref, 'cat.png')
})

test('![](path) with spaces written as %20 or in <>', () => {
  assert.equal(embedsIn('![](sub/name%20with%20spaces.png)')[0].ref, 'sub/name with spaces.png')
  assert.equal(embedsIn('![](<sub/name with spaces.png>)')[0].ref, 'sub/name with spaces.png')
  assert.equal(embedsIn('![a|250](pic.jpg)')[0].width, '250')
})

test('not an embed: addresses, notes, links, headings, other files', () => {
  assert.deepEqual(embedsIn('![](https://example.com/cat.png)'), [])
  assert.deepEqual(embedsIn('![](haligtree://assets/abc.png)'), [])
  assert.deepEqual(embedsIn('![[Some note]]'), [])
  assert.deepEqual(embedsIn('![[Some note#Heading]]'), [])
  assert.deepEqual(embedsIn('![[report.docx]]'), [])
  assert.deepEqual(embedsIn('[[cat.png]]'), [])
  assert.equal(embedsIn('![[paper.pdf#page=3]]')[0].ref, 'paper.pdf')
})

test('several in a line, in order', () => {
  const found = embedsIn('see ![[a.png]] and ![](b/c.gif) here')
  assert.deepEqual(found.map((one) => one.ref), ['a.png', 'b/c.gif'])
  assert.equal('see ![[a.png]] and ![](b/c.gif) here'.slice(found[1].from, found[1].to), '![](b/c.gif)')
})

test('a line that is only a path', () => {
  assert.equal(barePath('../../extras/attachments/Screenshot 2026-08-26 at 23.55.08.png'), '../../extras/attachments/Screenshot 2026-08-26 at 23.55.08.png')
  assert.equal(barePath('  attachments/x.webp '), 'attachments/x.webp')
  assert.equal(barePath('cat.png'), null)
  assert.equal(barePath('I like cat.png'), null)
  assert.equal(barePath('https://example.com/a/b.png'), null)
  assert.equal(barePath('see attachments/x.png now'), null)
  assert.equal(barePath('notes/ideas.md'), null)
})

test('a line of only embeds, or not', () => {
  assert.equal(onlyEmbeds('![[a.png]] ![[b.png]]')?.length, 2)
  assert.equal(onlyEmbeds('look: ![[a.png]]'), null)
  assert.equal(onlyEmbeds('plain words'), null)
  assert.equal(onlyEmbeds('extras/a.png')?.[0].ref, 'extras/a.png')
})

test('names and tails', () => {
  assert.equal(nameOf('../../extras/attachments/Shot.png'), 'Shot.png')
  assert.equal(tailOf('../../extras/attachments/Shot.png'), 'extras/attachments/Shot.png')
  assert.equal(tailOf('./a/b.png'), 'a/b.png')
  assert.equal(cleanRef(' a%20b.PNG '), 'a b.PNG')
  assert.equal(cleanRef('data:image/png;base64,xx.png'), null)
})
