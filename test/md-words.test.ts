// Run with: node --test test/md-words.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mdWords } from '../src/main/md-words.ts'

test('the line the user saw: a task with a link reads as words', () => {
  assert.equal(mdWords('- [ ] Can use numbers from [GitHub - 100+ abstract shapes](https://github.com/x/shapes)'), 'Can use numbers from GitHub - 100+ abstract shapes')
})

test('tasks, ticked or not, lose the box and the dash', () => {
  assert.equal(mdWords('- [ ] call the bank'), 'call the bank')
  assert.equal(mdWords('- [x] send the form'), 'send the form')
  assert.equal(mdWords('* [X] done'), 'done')
  assert.equal(mdWords('1. [ ] first'), 'first')
  assert.equal(mdWords('[ ] bare box'), 'bare box')
})

test('nested lists lose their indent and marks', () => {
  assert.equal(mdWords('- one\n  - two\n    - [ ] three\n\t+ four\n2) five'), 'one\ntwo\nthree\nfour\nfive')
})

test('links read as their words; bare addresses and autolinks stay as addresses', () => {
  assert.equal(mdWords('see [this](https://x.org/a_(b)) and [that](y)'), 'see this and that')
  assert.equal(mdWords('go to https://example.com/page now'), 'go to https://example.com/page now')
  assert.equal(mdWords('<https://example.com>'), 'https://example.com')
  assert.equal(mdWords('no links [here] (or here)'), 'no links [here] (or here)')
})

test('pictures say nothing, Obsidian embeds too', () => {
  assert.equal(mdWords('![](haligtree://assets/a.png)\nThe Law Book, p. 82'), '\nThe Law Book, p. 82')
  assert.equal(mdWords('A ![[shot.png]] here'), 'A  here')
  assert.equal(mdWords('![cover](https://x.org/Book (Library).png) after'), 'after')
})

test('bold, italic, strike, highlight and inline code lose their marks', () => {
  assert.equal(mdWords('**bold** and __strong__'), 'bold and strong')
  assert.equal(mdWords('*italic* and _soft_ words'), 'italic and soft words')
  assert.equal(mdWords('~~gone~~ ==lit=='), 'gone lit')
  assert.equal(mdWords('run `npm test` now'), 'run npm test now')
  assert.equal(mdWords('snake_case_name stays'), 'snake_case_name stays')
  assert.equal(mdWords('2 * 3 * 4'), '2 * 3 * 4')
})

test('headings and quotes lose their marks; tags stay as #tag', () => {
  assert.equal(mdWords('# Title'), 'Title')
  assert.equal(mdWords('### Deep heading #project'), 'Deep heading #project')
  assert.equal(mdWords('> a quote'), 'a quote')
  assert.equal(mdWords('> > nested quote'), 'nested quote')
  assert.equal(mdWords('> [!note] Callout words'), 'Callout words')
  assert.equal(mdWords('> - [ ] task in a quote'), 'task in a quote')
  assert.equal(mdWords('Pomodoro/tempus #project #idea/sub'), 'Pomodoro/tempus #project #idea/sub')
})

test('wiki links read as their words; @ links as their name unless kept', () => {
  assert.equal(mdWords('see [[Other note]] and [[file|shown words]]'), 'see Other note and shown words')
  assert.equal(mdWords('by [[@abc123|Ursula Le Guin]]'), 'by Ursula Le Guin')
  assert.equal(mdWords('by [[@abc123|Ursula Le Guin]] and [[x]]', true), 'by [[@abc123|Ursula Le Guin]] and x')
})

test('code keeps its words but not a fence line or a "#" that is no tag', () => {
  assert.equal(mdWords('```js\nconst a = 1 #x\n```'), '\nconst a = 1 x\n')
  assert.equal(mdWords('colour `#fff` here'), 'colour fff here')
})

test('rules, footnotes, HTML tags and escapes go; a lone "<" stays', () => {
  assert.equal(mdWords('---'), '')
  assert.equal(mdWords('* * *'), '')
  assert.equal(mdWords('a claim[^1] made'), 'a claim made')
  assert.equal(mdWords('<b>loud</b> words<br>'), 'loud words')
  assert.equal(mdWords('1 < 2 and 3 > 2'), '1 < 2 and 3 > 2')
  assert.equal(mdWords('\\*not italic\\* \\[x\\]'), '*not italic* [x]')
})

test('maths reads as its symbols', () => {
  assert.equal(mdWords('energy $E=mc^2$ costs $5'), 'energy E=mc^2 costs $5')
})
