// Run with: node --test test/picture-has-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasWords } from '../src/main/picture-lines.ts'

// What Vision read in the sandbox's pictures (native/labels.swift --lines), line and confidence.
test('a painting read as letters has no words; a cover, a caption and a page do', () => {
  assert.equal(hasWords([{ text: 'AR ARALL', confidence: 0.5 }]), false, "Bruegel's Tower of Babel")
  assert.equal(hasWords([{ text: 'often seen.', confidence: 1 }]), true, 'a cartoon caption')
  assert.equal(hasWords([{ text: 'LIPPINCOTT\'S', confidence: 1 }, { text: '1-100', confidence: 0.3 }]), true, 'a magazine cover')
  assert.equal(hasWords([{ text: 'the cat sat', confidence: 0.5 }]), true, 'handwriting Vision half believes, three words')
  assert.equal(hasWords([{ text: '| 1 ~ 4', confidence: 1 }]), false, 'symbols and digits alone')
  assert.equal(hasWords([{ text: 'AR ARALL' }]), false, 'read before confidence was kept')
  assert.equal(hasWords([{ text: 'MONT', confidence: 1 }], true), false, 'one sure word on a painting')
  assert.equal(hasWords([{ text: 'The Hay Wain', confidence: 1 }], true), true, "a painting's title plate")
})
