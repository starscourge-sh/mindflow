// Run with: node --test test/graph-math.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, all } from 'mathjs'
import { contour, graphFromMarkdown, graphToMarkdown, meaningOf, niceStep, sampleCurve, tickLabel, zoomAt } from '../src/renderer/src/lib/graph-math.ts'

const math = create(all)

test('y = sin(x) is a curve in x, and its value at π/2 is 1', () => {
  const m = meaningOf(math, 'y = sin(x)')
  assert.equal(m.kind, 'explicit')
  if (m.kind === 'explicit') assert.equal(m.f.evaluate({ x: Math.PI / 2 }), 1)
})

test('a free letter gets a slider, and 2x or ax multiply as on Desmos', () => {
  const m = meaningOf(math, 'y = ax^2 + 2x')
  assert.equal(m.kind, 'explicit')
  if (m.kind === 'explicit') {
    assert.deepEqual(m.free, ['a'])
    assert.equal(m.f.evaluate({ x: 3, a: 2 }), 24)
  }
})

test('a circle is drawn as a contour; x = 3 is a curve in y; a = 2 is a constant', () => {
  assert.equal(meaningOf(math, 'x^2 + y^2 = 4').kind, 'implicit')
  const v = meaningOf(math, 'x = 3')
  assert.equal(v.kind === 'explicit' && v.over, 'y')
  assert.deepEqual(meaningOf(math, 'a = 2'), { kind: 'constant', name: 'a', value: 2, tex: 'a=2' })
  assert.equal(meaningOf(math, 'y = sin(').kind, 'error')
})

test('the circle contour lies on the circle', () => {
  const m = meaningOf(math, 'x^2 + y^2 = 4')
  assert.equal(m.kind, 'implicit')
  if (m.kind !== 'implicit') return
  const segs = contour((x, y) => m.f.evaluate({ x, y }), { xmin: -5, xmax: 5, ymin: -5, ymax: 5 }, 60, 60)
  assert.ok(segs.length > 40)
  for (const [x, y] of segs) assert.ok(Math.abs(Math.hypot(x, y) - 2) < 0.1)
})

test('tan is cut at its poles, not joined across them', () => {
  const pieces = sampleCurve(Math.tan, -3, 3, 600, 10)
  assert.ok(pieces.length >= 2)
})

test('grid steps are round and their labels have no float dust', () => {
  assert.equal(niceStep(20, 600), 2)
  assert.equal(tickLabel(0.1 + 0.2, 0.1), '0.3')
  assert.equal(tickLabel(-2, 1), '−2')
  const z = zoomAt({ xmin: -10, xmax: 10, ymin: -5, ymax: 5 }, 0.5, 2, 0)
  assert.deepEqual(z, { xmin: -4, xmax: 6, ymin: -2.5, ymax: 2.5 })
})

test('a narrower or taller graph keeps its size through Markdown', () => {
  const md = graphToMarkdown([{ id: '1', text: 'y = x', color: 'blue' }], {}, null, { width: '60%', height: 400 })
  assert.match(md, /\nsize: 60%, 400\n/)
  const back = graphFromMarkdown(md.split('\n').slice(1, -1).join('\n'))
  assert.equal(back.width, '60%')
  assert.equal(back.height, 400)
  assert.doesNotMatch(graphToMarkdown([], {}, null, { width: null, height: 320 }), /size:/)
})

test('Markdown round-trips lines, colours, sliders and the view', () => {
  const md = graphToMarkdown([{ id: '1', text: 'y = a*x^2', color: 'red' }, { id: '2', text: 'x^2 + y^2 = 4', color: 'blue' }], { a: { value: 1.5, min: -5, max: 5 } }, { xmin: -10, xmax: 10, ymin: -6, ymax: 6 })
  assert.equal(md, '```graph\ny = a*x^2 {red}\nx^2 + y^2 = 4 {blue}\na = 1.5 (-5 to 5)\nview: -10, 10, -6, 6\n```')
  const back = graphFromMarkdown(md.split('\n').slice(1, -1).join('\n'))
  assert.deepEqual(back.expressions.map((one) => [one.text, one.color]), [['y = a*x^2', 'red'], ['x^2 + y^2 = 4', 'blue']])
  assert.deepEqual(back.sliders, { a: { value: 1.5, min: -5, max: 5 } })
  assert.deepEqual(back.view, { xmin: -10, xmax: 10, ymin: -6, ymax: 6 })
})
