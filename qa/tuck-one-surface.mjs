// A tucked goal card slid out of its tab is one object: no strip beside it or inside it in any frame, in Paper and in Glass, and the whole card is on screen.
// Frames every 50ms of the slide out and the tuck back, for looking at.
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
    // Tucked, then opened out of its tab as main tells it when pointed at (shapeCard), then tucked again: a frame every 50ms.
    const frames = async (label, peek) => electron.evaluate(async ({ BrowserWindow }, [wid, peek, label]) => {
      const w = BrowserWindow.fromId(wid)
      const start = Date.now()
      w.webContents.send('beacon:peek', peek)
      const out = []
      for (let i = 0; i < 10; i++) {
        const strip = await w.webContents.executeJavaScript(`(() => { const one = document.querySelector('[data-tuck-strip]'); return one ? Number(getComputedStyle(one).opacity).toFixed(2) : 'none' })()`)
        out.push({ t: Date.now() - start, strip, png: (await w.webContents.capturePage()).toPNG().toString('base64'), label })
        await new Promise((r) => setTimeout(r, Math.max(0, (i + 1) * 50 - (Date.now() - start))))
      }
      return out
    }, [id, peek, label])
    const tucked = { side: 'right', nudge: false, flat: false, tucked: true, opened: false, room: { side: 14, top: 16, bottom: 10 }, hang: 12, strip: 0 }
    await frames('tuck', tucked)
    const opening = await frames('open', { ...tucked, opened: true, room: { side: 0, top: 0, bottom: 0 }, hang: 0, strip: 40 })
    const closing = await frames('close', tucked)
    if (shots) for (const one of [...opening, ...closing]) writeFileSync(`${shots}/tuck-${name}-${one.label}-${String(one.t).padStart(4, '0')}ms.png`, Buffer.from(one.png, 'base64'))
    const said = opening.map((one) => `${one.t}:${one.strip}`).join(' ')
    check(`${name}: out of its tab, no strip in any frame, only the card`, opening.every((one) => one.strip === 'none'), said)
    const pad = await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).webContents.executeJavaScript(`getComputedStyle(document.querySelector('[data-goal-card]')).paddingLeft`), id)
    check(`${name}: the card out keeps no room for a strip (its own 1rem only)`, parseFloat(pad) < 24, pad)
    await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid)?.webContents.send('beacon:peek', null, true), id).catch(() => {})
    await wait(800)
  }
  // Tucked as named tabs and pointed at: where main puts the card, read from what it asked for (HALIGTREE_QA_VIRTUAL).
  await v('settings:set', { stickiesTucked: 'tabs' })
  for (const [name, set, inset] of [['paper', { stickiesFrosted: false, stickiesGlass: false }, 20], ['glass', { stickiesFrosted: true, stickiesGlass: true }, 0]]) {
    await v('settings:set', set)
    await wait(3500)
    const out = await electron.evaluate(async ({ BrowserWindow, screen }, inset) => {
      const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && one.isVisible() && /view=sticky.*type=goal/.test(one.webContents.getURL()))
      if (!w) return null
      w.qaBoundsSeen = []
      await w.webContents.executeJavaScript('window.api.holdBeacon(true)')
      await new Promise((r) => setTimeout(r, 300))
      const opened = w.getBounds().width > 120 ? w.getBounds() : null
      if (!opened) return { seen: w.qaBoundsSeen, now: w.getBounds() }
      const area = screen.getPrimaryDisplay().workArea
      return opened && { left: opened.x + inset, right: opened.x + opened.width - inset, areaLeft: area.x, areaRight: area.x + area.width }
    }, inset)
    check(`${name}: opened from its tab, the whole card is on screen`, !!out && out.left >= out.areaLeft && out.right <= out.areaRight, JSON.stringify(out))
  }
} finally {
  await c.close()
}
done()
