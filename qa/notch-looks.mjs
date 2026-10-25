// The session pill under the notch, open, in each of its states (work, time's
// up, break, break over), in a light and a dark theme with three accents each,
// one of them a pale lime: one header (the ring and the time in the wings), no
// row repeated, one shared left edge, and a filled button whose words read.
//
//   npx electron-vite build --outDir out-pill
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pill/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_NOTCH=1 SHOT=<dir> node qa/notch-looks.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? 'scratchpad/notch-looks'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
// The contrast of the filled button's words on its fill, and where the parts start.
const measure = (pill) => pill.evaluate(() => {
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const lum = (color) => {
    paint.clearRect(0, 0, 1, 1); paint.fillStyle = color; paint.fillRect(0, 0, 1, 1)
    const [r, g, b] = paint.getImageData(0, 0, 1, 1).data
    const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const filled = [...document.querySelectorAll('[data-island-panel] button')].find((one) => getComputedStyle(one).backgroundColor !== 'rgba(0, 0, 0, 0)' && !one.dataset.more)
  let ratio = null
  if (filled) {
    const [a, b] = [lum(getComputedStyle(filled).color), lum(getComputedStyle(filled).backgroundColor)]
    ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }
  const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null)
  const ring = document.querySelector('[data-notch-band] svg')
  const head = document.querySelector('[data-notch-head] span span')
  const field = document.querySelector('[data-island-panel] label')
  const rings = document.querySelectorAll('[data-island] svg[viewBox="0 0 22 22"]').length
  return { ratio: ratio && Math.round(ratio * 10) / 10, ring: left(ring), head: left(head), button: left(filled), field: left(field), rings }
})

try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', pillSits: 'notch' })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  let id = await v('session:start', task.id, 'Warm up', 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await pillWindow()
  await pill.waitForTimeout(2500)
  await v('session:cancel', id)
  await pill.waitForTimeout(1200)

  const looks = [['light', null], ['light', '#c6f432'], ['light', '#7a52ff'], ['dark', null], ['dark', '#c6f432'], ['dark', '#a7c080']]
  for (const [theme, accent] of looks) {
    const name = `${theme}-${accent ? accent.slice(1) : 'theme'}`
    await h.evaluate((t) => localStorage.setItem('theme', t), theme)
    await pill.reload()
    await pill.waitForTimeout(1200)
    if (accent) await pill.evaluate((a) => document.documentElement.style.setProperty('--tt-brand-color-400', a), accent)
    await pill.evaluate(() => (window.haligtreeNudges = [60, 60, 60]))
    const open = async () => { await pill.hover('[data-island]', { position: { x: 160, y: 10 } }); await pill.waitForTimeout(900) }
    const shoot = async (state) => {
      const m = await measure(pill)
      await pill.screenshot({ path: `${SHOT}/${state}-${name}.png` })
      return m
    }
    // Work.
    id = await v('session:start', task.id, 'Write the chapter on rivers', 25 * 60000)
    await h.evaluate(() => window.api.showFocus(true))
    await pill.waitForTimeout(2600)
    await open()
    let m = await shoot('work')
    check(`work: one ring, one left edge (${name})`, m.rings === 1 && m.ring === m.head, JSON.stringify(m))
    await pill.mouse.move(1, 1)
    await v('session:cancel', id)
    await pill.waitForTimeout(1500)
    // Time's up: it opens on its own.
    id = await v('session:start', task.id, 'Write the chapter on rivers', 2500)
    await h.evaluate(() => window.api.showFocus(true))
    await pill.waitForTimeout(5500)
    m = await shoot('timeup')
    check(`time's up: the filled button reads (${name})`, m.ratio >= 4.5, `contrast ${m.ratio}`)
    check(`time's up: header, button and field on one left edge (${name})`, m.ring === m.head && m.head === m.button && m.button === m.field, JSON.stringify(m))
    const words = await pill.$eval('[data-notch-head]', (one) => one.textContent)
    check(`time's up: its line has “+10 min” (${name})`, words.includes('+10 min'), words)
    // Into a break, from the time's-up card.
    await pill.click('[data-take-break]')
    await pill.waitForTimeout(3500)
    await open()
    m = await shoot('break')
    check(`break: the filled button reads (${name})`, m.ratio === null || m.ratio >= 4.5, `contrast ${m.ratio}`)
    await pill.mouse.move(1, 1)
    await v('session:cancel', (await v('focus:now')).id)
    await pill.waitForTimeout(1500)
    // Break over.
    await v('break:start', null, 2500)
    await h.evaluate(() => window.api.showFocus(true))
    await pill.waitForTimeout(5500)
    m = await shoot('break-over')
    check(`break over: the filled button reads (${name})`, m.ratio >= 4.5, `contrast ${m.ratio}`)
    await v('session:cancel', (await v('focus:now')).id)
    await pill.waitForTimeout(1500)
  }
  check('no errors', c.errors.length === 0, c.errors.slice(0, 3).join(' / '))
} catch (error) {
  console.log('FAIL  the run stopped:', error.message)
  results.push(false)
} finally {
  await v('settings:set', { pillSits: 'free' }).catch(() => {})
  console.log(`${results.filter(Boolean).length}/${results.length} passed`)
  await c.close()
  process.exit(results.every(Boolean) ? 0 : 1)
}
