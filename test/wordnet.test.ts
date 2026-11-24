// Run with: node --test test/wordnet.test.ts
// "decide" is one family with "decision". A definition comes from the shipped database, offline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineWord, familyOf } from '../src/main/wordnet.ts'

test('decide finds decision, and ephemeral has a meaning', () => {
  const family = familyOf('decide')
  assert.ok(family.includes('decision'), family.join(', '))
  const entry = defineWord('ephemeral')
  assert.ok(entry)
  assert.equal(entry?.word, 'ephemeral')
  assert.ok(entry?.senses.some((sense) => /short/i.test(sense.gloss)))
  assert.ok(entry?.senses.some((sense) => sense.synonyms.includes('transient')))
  assert.equal(defineWord('notawordxyz'), null)
  assert.deepEqual(familyOf(''), [])
})
