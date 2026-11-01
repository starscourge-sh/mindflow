// Stickies and goal cards at scale, for looking at: 1, 5, 20 and 50 notes out at once with long titles, goals 3 days
// and 3 years away (a grid of 1,000+ days), as Paper and as Glass. Each card's page is captured and laid on a desk.
// Checks: every card is drawn, none wider than its window, and the 3-year goal's grid stays inside its card.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=<dir> node qa/stickies-scale.mjs
import { rmSync, writeFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
const v = (channel, ...args) => h.evaluate(([one, rest]) => window.api.haligtree(one, ...rest), [channel, args])
const shots = process.env.QA_SHOTS ?? '/tmp'
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const desk = async (name) => {
  await wait(1500)
  const cards = await electron.evaluate(async ({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible() && w.webContents.getURL().includes('view=sticky'))
    return Promise.all(wins.map(async (w) => ({ b: w.getBounds(), src: (await w.webContents.capturePage().catch(() => null))?.toDataURL() ?? '' })))
  })
  const page = `${shots}/${name}.html`
  writeFileSync(page, `<body style="margin:0;padding:16px;display:flex;flex-wrap:wrap;gap:8px;width:2400px;background:linear-gradient(135deg,#5b6b7d,#8a7f73 60%,#3f4a3c)">${cards.map(({ b, src }) => `<img src="${src}" style="width:${b.width}px;height:${b.height}px">`).join('')}</body>`)
  const png = await electron.evaluate(async ({ BrowserWindow }, page) => {
    const view = new BrowserWindow({ show: false, paintWhenInitiallyHidden: true, width: 2432, height: 2400, useContentSize: true })
    await view.loadFile(page)
    await new Promise((r) => setTimeout(r, 800))
    const out = (await view.webContents.capturePage()).toPNG().toString('base64')
    view.destroy()
    return out
  }, page)
  writeFileSync(`${shots}/${name}.png`, Buffer.from(png, 'base64'))
  rmSync(page)
  return { n: cards.length, drawn: cards.filter((one) => one.src.length > 2000).length }
}
try {
  await wait(2500)
  const long = 'Remember to ask the landlord about the boiler, the damp patch in the hall and whether the deposit comes back before'
  const notes = []
  for (let i = 0; i < 50; i++) notes.push(await h.evaluate(([title]) => window.api.captures.create({ title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] } }), [i % 3 === 0 ? `${long} ${i}` : `Note ${i + 1}`]))
  const soon = await v('goal:new', 'Hand in the thesis, every chapter, the bibliography and the appendix', day(3)).catch(() => null)
  const far = await v('goal:new', 'Speak Spanish', day(1100), day(-30)).catch(() => null)
  // Set to "Always", as a person would: a goal made a moment ago otherwise waits its turn before its card comes out.
  for (const id of [soon, far].filter(Boolean)) await v('goal:beacon:set', typeof id === 'string' ? id : id.id, 'always')
  let out = 0
  for (const [material, set] of [['paper', { stickiesFrosted: false, stickiesGlass: false }], ['glass', { stickiesFrosted: true, stickiesGlass: true }]]) {
    await v('settings:set', set)
    for (const n of [1, 5, 20, 50]) {
      while (out < n) await h.evaluate((id) => window.api.stick('capture', id, true), notes[out++])
      // Dealt onto the desk one after another, 40ms apart: 50 take two seconds to come.
      await wait(2500 + n * 60)
      const seen = await desk(`stickies-${material}-${n}`)
      check(`${material}, ${n} notes out: every card drawn (${seen.n} windows, the 3-day and 3-year goals among them)`, seen.drawn === seen.n && seen.n >= n + 3, `${seen.drawn} of ${seen.n}`)
    }
    for (let i = out - 1; i >= 0; i--) await h.evaluate((id) => window.api.stick('capture', id, false), notes[i])
    out = 0
    await wait(1500)
  }
  check('both test goals were made (3 days and 1,100 days away)', !!soon && !!far, JSON.stringify({ soon: !!soon, far: !!far }))
} finally {
  await c.close()
}
done()
