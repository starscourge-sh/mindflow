// The welcome's leaf bunches are never a still picture: on the title card once the five have landed, and on
// the Ready page ("Open my book"), each leaf stirs slowly on its own, its tip further than its stem, about
// 3 to 8 degrees, and any move of the pointer on the page stirs them a little more, by its speed.
// Measured off the qaLeafTrace hook: each leaf's tip angle over 10 s at rest, then 10 s with the pointer moving.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/leaf-stir.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

delete process.env.QA_ARGS
const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h, errors, close } = c
const shots = process.env.SHOTS
const DEG = 180 / Math.PI
const wait = (ms) => h.waitForTimeout(ms)
const start = () => h.evaluate(() => (window.qaLeafTrace = []))
// Per leaf over the frames traced: how far its tip and its stem swung (degrees, low to high), and its tip's angles.
const read = () => h.evaluate(() => (window.qaLeafTrace ?? []).filter((one) => one.bunch.length === 5))
const swing = (frames, k) => {
  const per = [0, 1, 2, 3, 4].map((i) => frames.map((one) => one.bunch[i][k]))
  return per.map((all) => (Math.max(...all) - Math.min(...all)) * DEG)
}
// How alike two leaves' tips move: 1 in step, near 0 or below each on its own.
const together = (frames) => {
  const a = frames.map((one) => one.bunch[0][2]), b = frames.map((one) => one.bunch[3][2])
  const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  const [ma, mb] = [m(a), m(b)]
  const cov = m(a.map((x, i) => (x - ma) * (b[i] - mb)))
  return cov / Math.sqrt(m(a.map((x) => (x - ma) ** 2)) * m(b.map((x) => (x - mb) ** 2)))
}
const r = (xs) => xs.map((x) => Math.round(x * 10) / 10)
const wander = async (ms) => {
  const end = Date.now() + ms
  for (let i = 0; Date.now() < end; i++) {
    const x = 200 + ((i * 97) % 600), y = 150 + ((i * 53) % 300)
    await h.mouse.move(x, y, { steps: 6 })
    await wait(40)
  }
}
try {
  // The title card: the five fly in and land (about 4.5 s), their stir fades in after.
  await h.waitForSelector('[data-title-card]', { timeout: 15000 })
  await wait(5000)
  await start()
  await wait(3000)
  const card = await read()
  if (shots) await h.screenshot({ path: `${shots}/title-card-bunch.png` })
  const cardTip = swing(card, 2)
  check('title card: landed, each tip sways, about 0.3 to 9° low to high in 3 s', card.length > 30 && cardTip.every((d) => d > 0.3 && d < 9), JSON.stringify(r(cardTip)))
  await start()
  await wander(2000)
  const cardMoved = swing(await read(), 2)
  check('title card: a moving pointer stirs them more', cardMoved.reduce((s, d) => s + d, 0) > cardTip.reduce((s, d) => s + d, 0), `${JSON.stringify(r(cardTip))} -> ${JSON.stringify(r(cardMoved))}`)

  // On to the Ready page.
  await h.mouse.move(1435, 300)
  for (let i = 0; i < 40 && !(await h.getByText(/commonplace book is ready/).count()); i++) {
    await h.keyboard.press('Escape')
    await wait(300)
    await h.locator('footer button').filter({ hasText: /^(Next|Show me|Skip trying it)/ }).last().click().catch(() => {})
    await wait(700)
  }
  await h.mouse.move(1435, 300)
  await wait(14000)
  await start()
  await wait(10000)
  const still = await read()
  const tip = swing(still, 2), stem = swing(still, 0)
  if (shots) await h.screenshot({ path: `${shots}/ready-bunch.png` })
  check('Ready: at rest each tip sways, about 3 to 14° low to high over 10 s', still.length > 100 && tip.every((d) => d > 3 && d < 14), JSON.stringify(r(tip)))
  // A sway, not a shiver: each tip turns back at most about once every 2 s (wiggles under 0.15° not counted).
  const turns = [0, 1, 2, 3, 4].map((i) => { let n = 0, dir = 0, from = still[0].bunch[i][2]; for (const one of still) { const d = one.bunch[i][2] - from; if (Math.abs(d) * DEG < 0.15) continue; const now = Math.sign(d); if (dir && now !== dir) n++; dir = now; from = one.bunch[i][2] } return n })
  check('Ready: it sways, never shivers (each tip turns back under 6 times in 10 s)', turns.every((n) => n < 6), JSON.stringify(turns))
  check('Ready: the tips swing further than the stems', tip.every((d, i) => d > stem[i]), `tips ${JSON.stringify(r(tip))} stems ${JSON.stringify(r(stem))}`)
  check('Ready: each leaf on its own phase', Math.abs(together(still)) < 0.9, String(Math.round(together(still) * 100) / 100))
  await start()
  await wander(10000)
  const moved = swing(await read(), 2)
  check('Ready: a moving pointer anywhere stirs them more, never wildly (under 22° low to high)', moved.reduce((s, d) => s + d, 0) > tip.reduce((s, d) => s + d, 0) * 1.15 && moved.every((d) => d < 22), `${JSON.stringify(r(tip))} -> ${JSON.stringify(r(moved))}`)
  // The pointer resting on a choice: the drifting leaves get excited, and the bunch sways harder with them.
  await h.mouse.move(1435, 300)
  await wait(4000)
  await start()
  await wait(4000)
  const calm = swing(await read(), 2)
  const choice = h.getByText(/someone else.s book/).first()
  const box = await choice.boundingBox()
  await h.mouse.move(box.x + 20, box.y + 10, { steps: 8 })
  await wait(1500)
  await start()
  await wait(4000)
  const excited = swing(await read(), 2)
  if (shots) await h.screenshot({ path: `${shots}/ready-bunch-excited.png` })
  check('Ready: a choice pointed at, the bunch sways harder with the leaves', excited.reduce((s, d) => s + d, 0) > calm.reduce((s, d) => s + d, 0) * 1.5, `${JSON.stringify(r(calm))} -> ${JSON.stringify(r(excited))}`)
  check('no page errors', errors.length === 0, errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await close()
}
done()
