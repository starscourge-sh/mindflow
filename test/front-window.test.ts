// Run with: node --test test/front-window.test.ts
// Quick capture's "From" line names the app in front only when one of its windows can be seen. An AeroSpace user
// switches from Ghostty's workspace to an empty one: Ghostty stays the Mac's front app and its windows are slid to the
// screen's corner, still listed as on screen. The capture must not say "From Ghostty: “herdr”".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seenTitle, type SeenWindow } from '../src/main/front-window.ts'

const laptop = [{ x: 0, y: 0, w: 1512, h: 982 }]
const ghostty = (at: Partial<SeenWindow>): SeenWindow => ({ layer: 0, alpha: 1, x: 40, y: 60, w: 1200, h: 800, name: 'herdr', ...at })

test('an empty AeroSpace workspace: Ghostty is in front but its window sits in the corner, so no source', () => {
  // AeroSpace's hiding place: the window's top-left a pixel inside the bottom-right corner.
  assert.equal(seenTitle([ghostty({ x: 1511, y: 981 })], laptop), null)
  // And with nothing listed at all (a real macOS Space of its own).
  assert.equal(seenTitle([], laptop), null)
})

test('Ghostty in plain view: its window’s name is the source', () => {
  assert.equal(seenTitle([ghostty({})], laptop), 'herdr')
})

test('only the windows that can be seen give the name: a hidden one is skipped for the one on screen', () => {
  const hidden = ghostty({ x: 1511, y: 981, name: 'herdr' })
  const shown = ghostty({ name: 'notes.md' })
  assert.equal(seenTitle([hidden, shown], laptop), 'notes.md')
})

test('without Screen Recording the Mac gives no names: the app is still said, with no title', () => {
  assert.equal(seenTitle([ghostty({ name: '' })], laptop), '')
})
