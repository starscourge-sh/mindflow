// Run with: node --test test/md-links.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdLinksAsWords } from '../src/renderer/src/lib/md-links.ts'

test('a gem kept from a PDF reads as words, never as addresses', () => {
  const body = '![](haligtree://assets/3aa44dcd97fa1ad8.png)\n[The Law Book, p. 82](haligtree://assets/f115fce7061fa6438800a4b0a4 (Library).pdf)'
  assert.equal(mdLinksAsWords(body), '\nThe Law Book, p. 82')
  assert.equal(mdLinksAsWords('see [this](https://x.org/a_(b)) and [that](y)'), 'see this and that')
  assert.equal(mdLinksAsWords('no links [here] (or here)'), 'no links [here] (or here)')
})
