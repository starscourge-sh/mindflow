// Run with: node --test test/task-links.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkName, linkOut, linkShown, wordsLeft } from '../src/main/task-links.ts'

test('a task named by a link: the address comes out, the words stay, the name is the site and path', () => {
  const alone = linkOut('https://youtu.be/hi8meiPUt84?si=b8PFg1eTrFykzxCf')
  assert.equal(alone.href, 'https://youtu.be/hi8meiPUt84?si=b8PFg1eTrFykzxCf')
  assert.equal(wordsLeft(alone.text), '')
  assert.equal(linkName(alone.href!), 'youtu.be · hi8meiPUt84')
  const said = linkOut('watch https://youtu.be/hi8meiPUt84?si=x tomorrow')
  assert.equal(said.text.length, 'watch https://youtu.be/hi8meiPUt84?si=x tomorrow'.length)
  assert.equal(wordsLeft(said.text), 'watch tomorrow')
  assert.equal(wordsLeft(linkOut('read this - www.example.com/a/b.').text), 'read this')
  assert.equal(linkOut('read this - www.example.com/a/b.').href, 'https://www.example.com/a/b')
  assert.equal(linkName('https://www.youtube.com/watch?v=abc123&t=4'), 'youtube.com · abc123')
  assert.equal(linkName('https://example.com/'), 'example.com')
  assert.equal(linkShown('https://www.example.com/a%20b/?q=1'), 'example.com/a b')
  assert.equal(linkShown('https://example.com/%E0%A4%A'), 'example.com/%E0%A4%A')
  assert.equal(linkOut('call mum at 5').href, null)
})
