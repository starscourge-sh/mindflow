// A tucked goal card slid out of its tab is one surface: the name's strip is the card's own edge (no paper of its own),
// the same top and bottom as the card, in Paper and in Glass. Pictures of each, opened, for looking at.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=<dir> node qa/tuck-one-surface.mjs
import { writeFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
const v = (channel, ...args) => h.evaluate(([one, rest]) => window.api.haligtree(one, ...rest), [channel, args])
const shots = process.env.QA_SHOTS
try {
  await wait(2500)
  for (const [name, set] of [['paper', { stickiesFrosted: false, stickiesGlass: false }], ['glass', { stickiesFrosted: true, stickiesGlass: true }]]) {
    await v('settings:set', set)
    await wait(3500)
    const id = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible() && /view=sticky.*type=goal/.test(w.webContents.getURL()))?.id)
    if (!id) { check(`${name}: a goal card is out`, false); continue }
    // Opened out of its tab as main tells it when pointed at (shapeCard): the strip on the screen side, 34 points wide.
    await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).webContents.send('beacon:peek', { side: 'right', nudge: false, flat: false, tucked: true, opened: true, room: { side: 0, top: 0, bottom: 0 }, hang: 0, strip: 34 }, true), id)
    await wait(1200)
    const seen = await electron.evaluate(async ({ BrowserWindow }, wid) => {
      const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.isVisible() && /view=sticky.*type=goal/.test(one.webContents.getURL()))
      const read = await w.webContents.executeJavaScript(`(() => {
        const strip = document.querySelector('[data-tuck-strip]')?.getBoundingClientRect()
        const card = document.querySelector('[data-goal-card], .mf-card')?.getBoundingClientRect()
        const fill = document.querySelector('[data-tuck-strip]') ? getComputedStyle(document.querySelector('[data-tuck-strip]')).backgroundColor : null
        return { strip: strip && [strip.left, strip.top, strip.right, strip.bottom].map(Math.round), card: card && [card.left, card.top, card.right, card.bottom].map(Math.round), fill }
      })()`)
      return { ...read, png: (await w.webContents.capturePage()).toPNG().toString('base64') }
    }, id)
    if (shots) writeFileSync(`${shots}/tuck-open-${name}.png`, Buffer.from(seen.png, 'base64'))
    check(`${name}: the strip has no paper of its own`, seen.fill === 'rgba(0, 0, 0, 0)', seen.fill)
    check(`${name}: the strip lies on the card, its top and bottom the card's`, !!seen.strip && !!seen.card && seen.strip[0] >= seen.card[0] - 1 && Math.abs(seen.strip[1] - seen.card[1]) <= 1 && Math.abs(seen.strip[3] - seen.card[3]) <= 1, JSON.stringify({ strip: seen.strip, card: seen.card }))
    await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid)?.webContents.send('beacon:peek', null, true), id).catch(() => {})
    await wait(800)
  }
} finally {
  await c.close()
}
done()
