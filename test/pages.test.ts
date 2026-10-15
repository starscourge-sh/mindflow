// Run with: node --test test/pages.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { pageFor } from '../src/main/pages.ts'

test('each kind of window loads its own page', () => {
  assert.equal(pageFor(''), 'index.html')
  assert.equal(pageFor('?sandbox=1'), 'index.html')
  assert.equal(pageFor('?view=home'), 'home.html')
  assert.equal(pageFor('?view=home&sandbox=1&arrived=1'), 'home.html')
  assert.equal(pageFor('?note=capture%3Aabc'), 'note.html')
  assert.equal(pageFor('?drawing=d1&in=A%20drawing'), 'drawing.html')
  assert.equal(pageFor('?view=focus'), 'pill.html')
  assert.equal(pageFor('?view=glow&sandbox=1'), 'pill.html')
  assert.equal(pageFor('?view=nudge'), 'nudge.html')
  assert.equal(pageFor('?view=look'), 'look.html')
  for (const type of ['capture', 'goal', 'today']) assert.equal(pageFor(`?view=sticky&type=${type}&id=x&nth=0`), 'sticky.html')
})

test('a word that only starts like a view is not that view', () => {
  assert.equal(pageFor('?view=homework'), 'index.html')
  assert.equal(pageFor('?notes=1'), 'index.html')
})

test('every page exists, built from its own entry', () => {
  for (const page of ['index', 'home', 'note', 'sticky', 'pill', 'nudge', 'look', 'drawing']) {
    const file = `src/renderer/${page}.html`
    assert.ok(existsSync(file), file)
    const entry = readFileSync(file, 'utf8').match(/src="\/src\/windows\/([a-z]+)\.tsx"/)?.[1]
    assert.equal(entry, page === 'index' ? 'box' : page, file)
  }
})
