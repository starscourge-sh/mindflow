// Run with: node --test test/clip.test.ts
// Words cut short never split an emoji or leave a lone half of one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clip, clipMiddle, cut, fittedTitle, quoted, unquoted } from '../src/main/clip.ts'

const lone = (text: string): boolean => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text)

test('a cut keeps every emoji whole', () => {
  const words = '🎓📚✍️🎉👩🏽‍🎓🎓📚✍️🎉👩🏽‍🎓 thesis'
  for (let n = 1; n < 14; n++) {
    assert.ok(!lone(cut(words, n)), `cut ${n}`)
    assert.ok(!lone(clip(words, n)), `clip ${n}`)
    assert.ok(!lone(clipMiddle(words, n)), `middle ${n}`)
  }
  assert.equal(cut('👩🏽‍🎓👩🏽‍🎓', 1), '👩🏽‍🎓')
  assert.equal(clip('What did the creature learn from 📖 Milton', 34), 'What did the creature learn from…')
  assert.equal(clip('short', 40), 'short')
})

test('look-alike names cut in the middle stay apart', () => {
  const a = clipMiddle('Email the department about the extension, fragment 7', 30)
  const b = clipMiddle('Email the department about the extension, fragment 8', 30)
  assert.notEqual(a, b)
  assert.ok(a.endsWith('7'))
})

test('a quote is never quoted twice', () => {
  assert.equal(quoted('“To be or not to be”'), '“To be or not to be”')
  assert.equal(quoted('"Plain marks"'), '“Plain marks”')
})

test('a long quote is cut at a word, once quoted', () => {
  const line = '“You either get what you want, or you just get old”'
  assert.equal(quoted(line, 44, (text, n) => fittedTitle(text, n) ?? text), '“You either get what you want, or you just…”')
  assert.equal(unquoted(line), 'You either get what you want, or you just get old')
  assert.equal(unquoted('Plain words'), 'Plain words')
})
