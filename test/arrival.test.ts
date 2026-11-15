// The welcome's arrival (src/main/arrival.ts): when it may come as a scene over the whole screen, each case in which
// the plain thing is done instead (the welcome's window put in the middle at once, the welcome inside it), and the
// scene's moments main keeps to, the same as the scene's own (welcome-scene.tsx SCENE).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SCENE_COVERED, SCENE_HANDOVER, SCENE_WORDS, plainArrival, type ArrivalCase } from '../src/main/arrival.ts'

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
test("main keeps to the scene's own moments: the fog whole, the handover, the first words", () => {
  const scene = readFileSync(new URL('../src/renderer/src/components/haligtree/welcome-scene.tsx', import.meta.url), 'utf8')
  const at = (name: string): number => Number(scene.match(new RegExp(`\\b${name}: (\\d+)`))?.[1])
  assert.equal(SCENE_COVERED, at('covered'))
  assert.equal(SCENE_HANDOVER, at('handover'))
  assert.equal(SCENE_WORDS, at('words'))
  // In that order, the fog whole well before the scene draws in, the words after it.
  assert.ok(SCENE_COVERED < at('shrinkFrom') && at('shrinkTo') <= SCENE_HANDOVER && SCENE_HANDOVER < SCENE_WORDS)
})

// The scene covers the welcome's window on every shape of screen (15 Nov 2026: on the user's 1920 by 1080 screen the
// window, 1190 by 744, was left a bare band 37 px tall at its top and foot, the stage scaled by width only).
import { sceneCover } from '../src/renderer/src/components/haligtree/scene-cover.ts'
test('the scene covers the window on a 16:9 screen, a 16:10 one and a taller one', () => {
  for (const [w, h, win] of [[1920, 1080, { x: 365, y: 168, width: 1190, height: 744 }], [1920, 1200, { x: 365, y: 228, width: 1190, height: 744 }], [1920, 1243, { x: 365, y: 249, width: 1190, height: 744 }], [1470, 956, { x: 185, y: 134, width: 1100, height: 688 }]] as const) {
    const { scale, cutX, cutY } = sceneCover({ screen: { width: w, height: h }, window: win })
    // What the window shows of the stage, scaled, is exactly the window: never less on either side.
    assert.ok(Math.abs((w - 2 * cutX) * scale - win.width) < 0.5, `${w}x${h}: width ${(w - 2 * cutX) * scale}`)
    assert.ok(Math.abs((h - 2 * cutY) * scale - win.height) < 0.5, `${w}x${h}: height ${(h - 2 * cutY) * scale}`)
    assert.ok(w * scale >= win.width - 0.5 && h * scale >= win.height - 0.5, `${w}x${h}: the stage covers it`)
  }
})
