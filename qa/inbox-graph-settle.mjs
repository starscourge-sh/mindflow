// The Inbox's graph settles into a calm picture with 5, 50 and 500 captures: once settled, no two dots overlap,
// the whole map sits inside its frame (nothing cut off at an edge), and nothing drifts after it has settled.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/inbox-graph-settle.mjs
//   SHOTS=<folder> also films each size settling (a frame every 16ms for the first 1.5s) and saves light and dark.
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const width = Number(process.env.QA_WIDTH ?? 1300)
const c = await sandbox({ width, height: 860, seeded: false })
const { h, v, look } = c
const wait = (ms) => h.waitForTimeout(ms)
const TAGS = ['reading', 'design', 'garden', 'work', 'music', 'health', 'travel', 'cooking', 'money', 'family', 'film', 'code']
const WORDS = ['A thought on', 'Note about', 'Why I keep coming back to', 'Something from', 'Remember the', 'Small idea for']
const make = (rows) => h.evaluate(async (list) => { for (const text of list) await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }) }, rows)
let made = 0
const grow = async (to) => {
  const rows = []
  for (; made < to; made++) {
    const a = TAGS[(made * 7) % 3], b = TAGS[(made * 5 + 3) % TAGS.length]
    rows.push(`#${a}${made % 3 ? ` #${b}` : ''} ${WORDS[made % WORDS.length]} ${a}, number ${made + 1}`)
  }
  await make(rows)
}
// Each dot and where it sits on the screen, from the canvas's own report.
const dots = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-inbox-graph] canvas')
  return canvas?.mapDots?.() ?? []
})
// Where everything drawn sits inside the canvas: how close it comes to each edge, in screen pixels.
const edges = () => h.evaluate(() => {
  const canvas = document.querySelector('[data-inbox-graph] canvas'); const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let left = width, top = height, right = 0, bottom = 0
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] > 120) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  const d = devicePixelRatio
  return { left: left / d, top: top / d, right: (width - right) / d, bottom: (height - bottom) / d, w: width / d, h: height / d }
})
// How many pairs of lines cross, for each line: a calm map has clusters whose lines mostly stay inside them; a string
// folded over itself crosses its own lines again and again.
const crossings = async (list) => {
  const lines = await h.evaluate(() => document.querySelector('[data-inbox-graph] canvas')?.mapLines?.() ?? [])
  const at = new Map(list.map((one) => [one.id, one]))
  const seg = lines.map(([a, b]) => [at.get(a), at.get(b)]).filter(([a, b]) => a && b)
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  let crossed = 0
  for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) {
    const [a, b] = seg[i], [c, d] = seg[j]
    if (a === c || a === d || b === c || b === d) continue
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) crossed++
  }
  return { lines: seg.length, crossed, share: seg.length ? crossed / seg.length : 0 }
}
const overlaps = (list) => {
  let worst = 0, pairs = 0
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const one = list[a], two = list[b]
    const into = one.r + two.r - Math.hypot(one.x - two.x, one.y - two.y)
    if (into > 0.5) (pairs++, (worst = Math.max(worst, into)))
  }
  return { pairs, worst }
}
const film = async (name) => {
  if (!shots) return
  const graph = await h.$('[data-inbox-graph]')
  for (let i = 0; i < 24; i++) { await graph.screenshot({ path: `${shots}/${name}-f${String(i).padStart(2, '0')}.png` }); await wait(16) }
}
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await v('settings:set', { sounds: false, hintRate: 0, autoArchive: 0, inboxDays: 3650 })
  for (const size of [5, 50, 500]) {
    await grow(size)
    await h.reload(); await wait(1500)
    await c.go('inbox')
    console.log(JSON.stringify((await h.evaluate(async () => (await window.api.captures.list()).slice(0, 3).map((one) => [one.label, one.status, one.capturedAt])))))
    if (!(await h.$('[data-inbox-graph]'))) await h.click('button:has-text("Graph")')
    await h.waitForSelector('[data-inbox-graph] canvas', { timeout: 8000 })
    await h.click('[data-inbox-graph] button:has-text("All")')
    await h.mouse.move(5, 5)
    await film(`graph-${size}`)
    await wait(4000)
    const a = await dots(); await wait(1200); const b = await dots()
    const moved = Math.max(0, ...a.map((one, at) => Math.hypot(one.x - b[at].x, one.y - b[at].y)))
    const over = overlaps(b)
    const edge = await edges()
    const cross = await crossings(b)
    check(`${size}: lines rarely cross`, cross.share <= 1, `${cross.crossed} crossings over ${cross.lines} lines, ${cross.share.toFixed(2)} a line`)
    check(`${size}: the graph shows its dots`, b.length >= Math.min(size, 5) - 1, `${b.length} dots`)
    check(`${size}: no two dots overlap once settled`, over.pairs === 0, `${over.pairs} pairs, worst ${over.worst.toFixed(1)}px into each other`)
    check(`${size}: nothing drifts after it has settled`, moved < 1, `${moved.toFixed(2)} map units in 1.2s`)
    check(`${size}: the whole map sits inside its frame`, Math.min(edge.left, edge.top, edge.right, edge.bottom) >= 8, `clear of the edges by ${['left', 'top', 'right', 'bottom'].map((k) => `${k} ${Math.round(edge[k])}`).join(', ')}`)
    if (shots) for (const name of ['light', 'dark']) { await look(name); await wait(300); await (await h.$('[data-inbox-graph]')).screenshot({ path: `${shots}/graph-${size}-settled-${name}.png` }) }
    await look('light')
  }
  check('no errors on the page', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} catch (error) {
  if (shots) await h.screenshot({ path: `${shots}/error.png` }).catch(() => {})
  check('the run finished', false, error.message.split('\n')[0])
}
await c.close()
done()
