// Work done ahead (src/renderer/src/lib/warm.ts warmLater) runs only in a stretch with nothing being drawn, or once its
// time is up counted from the first ask: never in the slivers between a scroll's frames (15 Nov 2026: the paper's
// shaders compiled in one held a fling 85ms).
import { test } from 'node:test'
import assert from 'node:assert/strict'

type Asked = { go: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void; timeout?: number }
const asked: Asked[] = []
const g = globalThis as Record<string, unknown>
g.requestIdleCallback = (go: Asked['go'], options?: { timeout?: number }) => asked.push({ go, timeout: options?.timeout })
g.cancelIdleCallback = () => undefined
g.document = { querySelector: () => null }
const { warmLater } = await import('../src/renderer/src/lib/warm.ts')
const slot = (ms: number, didTimeout = false) => ({ didTimeout, timeRemaining: () => ms })

test('a sliver between frames is passed over: asked again, the work not run', () => {
  asked.length = 0
  let ran = 0
  warmLater(() => ran++)
  asked.shift()!.go(slot(3.8))
  assert.equal(ran, 0)
  assert.equal(asked.length, 1)
  asked.shift()!.go(slot(45))
  assert.equal(ran, 1)
})

test('its time up, it runs whatever the slot', () => {
  asked.length = 0
  let ran = 0
  warmLater(() => ran++, { timeout: 8000 })
  asked.shift()!.go(slot(1.2, true))
  assert.equal(ran, 1)
})

test('asked again, its time is what is left of it, never a fresh one', async () => {
  asked.length = 0
  warmLater(() => undefined, { timeout: 4000 })
  assert.ok(asked[0].timeout! > 3990 && asked[0].timeout! <= 4000, String(asked[0].timeout))
  await new Promise((done) => setTimeout(done, 60))
  asked.shift()!.go(slot(2))
  assert.ok(asked[0].timeout! <= 3945 && asked[0].timeout! >= 1, String(asked[0].timeout))
})
