// Picking a material never makes a sticky or a goal card go: from Glass to Paper and back, every card is still on
// screen, whole (opacity 1) and drawn (its page has painted pixels).
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/sticky-paper.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
const v = (channel, ...args) => h.evaluate(([one, rest]) => window.api.haligtree(one, ...rest), [channel, args])
const cards = () => electron.evaluate(async ({ BrowserWindow }) => Promise.all(BrowserWindow.getAllWindows()
  .filter((w) => !w.isDestroyed() && w.webContents.getURL().includes('view=sticky'))
  .map(async (w) => { try {
    const png = w.isVisible() ? await w.webContents.capturePage().then((one) => one.toBitmap(), () => Buffer.alloc(0)) : Buffer.alloc(0)
    let inked = 0
    for (let i = 3; i < png.length; i += 4 * 97) if (png[i] > 200) inked++
    const b = w.getBounds()
    return { b: `${b.x},${b.y},${b.width}x${b.height}`, id: w.id, type: new URL(w.webContents.getURL()).searchParams.get('type'), key: new URL(w.webContents.getURL()).searchParams.get('id')?.slice(0, 6), shown: w.isVisible(), opacity: w.qaOpacity ?? 1, inked } } catch { return null }
  })).then((all) => all.filter(Boolean)))
try {
  await electron.evaluate(({ BrowserWindow }) => {
    const destroy = BrowserWindow.prototype.destroy
    globalThis.qaGone = []
    const op = BrowserWindow.prototype.setOpacity
    BrowserWindow.prototype.setOpacity = function (value) { try { if (globalThis.qaWatch && (value === 0 || value === 1) && this.webContents.getURL().includes('view=sticky')) globalThis.qaGone.push(`op ${value} ${this.id} ${new Error().stack.split('\n').slice(2, 4).join(' | ')}`) } catch {} return op.call(this, value) }
    BrowserWindow.prototype.destroy = function () { try { if (this.webContents.getURL().includes('view=sticky')) globalThis.qaGone.push(`${this.id} ${new URL(this.webContents.getURL()).searchParams.get('id')?.slice(0, 6)} ${new Error().stack.split('\n').slice(2, 5).join(' | ')}`) } catch {} return destroy.call(this) }
  })
  await wait(2500)
  if (process.env.THEME) await h.evaluate((theme) => localStorage.setItem('theme', theme), process.env.THEME)
  const note = await h.evaluate(() => window.api.captures.create({ title: 'Buy bread', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buy bread' }] }] } }))
  await h.evaluate((id) => window.api.stick('capture', id, true), note)
  if (process.env.TUCK) await v('settings:set', { stickiesTucked: process.env.TUCK })
  await wait(3500)
  const start = (await cards()).length
  const GLASS = { stickiesFrosted: true, stickiesGlass: true }
  const PAPER = { stickiesFrosted: false, stickiesGlass: false }
  const FROST = { stickiesFrosted: true, stickiesGlass: false }
  for (const [name, set] of [['Paper', PAPER], ['Glass', GLASS], ['Paper again', PAPER], ['Frost', FROST], ['Paper from frost', PAPER], ['Glass', GLASS], ['Paper, third time', PAPER]]) {
    if (process.env.TRACE) await electron.evaluate((_, on) => { globalThis.qaWatch = on; if (on) globalThis.qaGone.push('--- watch') }, name === 'Paper from frost')
    await v('settings:set', set)
    await wait(3500)
    const now = await cards()
    if (process.env.QA_SHOTS) await electron.evaluate(async ({ BrowserWindow }, [dir, name]) => {
      const { writeFileSync } = process.mainModule.require('fs')
      for (const w of BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed() && one.isVisible() && one.webContents.getURL().includes('view=sticky')))
        writeFileSync(`${dir}/sticky-${name.replace(/[^a-z]+/gi, '-')}-${new URL(w.webContents.getURL()).searchParams.get('type')}-${w.id}.png`, (await w.webContents.capturePage()).toPNG())
    }, [process.env.QA_SHOTS, name])
    const live = now.filter((one) => one.shown && one.opacity === 1 && one.inked > 0)
    check(`${name}: every card on screen, whole and drawn`, now.length === start && live.length === now.length, JSON.stringify(now))
  }
  if (process.env.TRACE) console.log((await electron.evaluate(() => globalThis.qaGone)).join('\n'))
} finally {
  await c.close()
}
done()
