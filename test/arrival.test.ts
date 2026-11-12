// The welcome's arrival out of the desktop (src/main/arrival.ts): when the main window may be made see-through for
// it, and each case in which the plain thing is done instead (the window simply there, the welcome inside it).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLEAR_LIMIT, plainArrival, type ArrivalCase } from '../src/main/arrival.ts'

const may: ArrivalCase = { mac: true, welcome: true, test: false, still: false, safe: false, solid: false, secondDisplay: false, fullScreen: false }

test("a first run on the Mac's main screen arrives out of the desktop", () => {
  assert.equal(plainArrival(may), null)
})
test('each case does the plain thing, and says which', () => {
  assert.equal(plainArrival({ ...may, secondDisplay: true }), 'a second display')
  assert.equal(plainArrival({ ...may, fullScreen: true }), 'full screen')
  // Reduce motion and the app's own Motion off are one answer to the window: still.
  assert.equal(plainArrival({ ...may, still: true }), 'motion off')
  assert.equal(plainArrival({ ...may, safe: true }), 'safe mode')
  assert.equal(plainArrival({ ...may, test: true }), 'a test run')
  // One more than the brief's six: a Mac asked for solid surfaces gets no see-through window.
  assert.equal(plainArrival({ ...may, solid: true }), 'reduce transparency')
})
test('an ordinary launch never has a see-through window, whatever else holds', () => {
  assert.equal(plainArrival({ ...may, welcome: false }), 'no welcome')
  assert.equal(plainArrival({ ...may, mac: false }), 'not a Mac')
  for (const key of ['still', 'safe', 'solid', 'secondDisplay', 'fullScreen'] as const) assert.notEqual(plainArrival({ ...may, welcome: false, [key]: true }), null)
})
test('a see-through window is made solid well after the arrival ends, and well before a person would wait', () => {
  // The title's beat is at 11 seconds and the mist draws in within two more (welcome-title.tsx GATHER_AT).
  assert.ok(CLEAR_LIMIT > 13000 && CLEAR_LIMIT <= 30000, String(CLEAR_LIMIT))
})
