// Quick capture's menus over its own words are opaque: the Block menu opened over a table from its grip, and the "/"
// list, light and dark. The user, 15 Nov: "why is it not even properly blurred in the background", the table's words
// sharp through the Block menu's see-through fill. Text over text is never shown (playbook rule 19).
// Measured on the page's own frame: the menu's area with the card's words under it, less the same with them hidden,
// is what comes through; its edges are how sharp (nothing comes through an opaque menu).
//   QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-menu-opaque.mjs
// QA_SHOTS=dir saves each menu's frame.
import { join } from 'path'
import { mkdirSync } from 'fs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const cell = (kind, text) => ({ type: kind, content: [p(text)] })
const words = [['Service', 'State', 'Note'], ['NAT gateways in FastCatVPC', 'removed', 'saves 32 a month'], ['Elastic IPs in FastCatVPC', 'removed', 'two left unattached'], ['Load balancer', 'kept', 'serves the API']]
const table = { type: 'table', content: words.map((row, r) => ({ type: 'tableRow', content: row.map((text) => cell(r === 0 ? 'tableHeader' : 'tableCell', text)) })) }

/** The menu's fill and blur as drawn. */
const look = (selector) => page.evaluate((selector) => {
  const el = [...document.querySelectorAll(selector)].find((one) => one.offsetWidth)
  if (!el) return null
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, fill: s.backgroundColor, blur: s.backdropFilter }
}, selector)
/** How sharp what comes through the menu is: the edges of (the frame with the card's words) less (the frame without). */
const through = async (menu) => {
  const shot = async () => (await page.screenshot({ clip: { x: Math.round(menu.x), y: Math.round(menu.y), width: Math.round(menu.w), height: Math.round(menu.h) } })).toString('base64')
  const hide = (on) => page.evaluate((on) => document.querySelector('.app-container > [data-slot=resizable-panel-group]').style[on ? 'setProperty' : 'removeProperty']('visibility', 'hidden'), on)
  const a = await shot()
  await hide(true)
  await wait(150)
  const b = await shot()
  await hide(false)
  return page.evaluate(async ([a, b]) => {
    const read = async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const can = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
      const ctx = can.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, img.width, img.height)
    }
    const [x, y] = [await read(a), await read(b)]
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const diff = (i) => lum(x.data, i) - lum(y.data, i)
    let sum = 0
    let n = 0
    for (let r = 0; r < x.height; r++) for (let k = 1; k < x.width; k++) {
      const i = (r * x.width + k) * 4
      sum += Math.abs(diff(i) - diff(i - 4))
      n++
    }
    return sum / n
  }, [a, b])
}
const seeThrough = (fill) => /\/\s*0?\.\d|rgba\([^)]*,\s*0?\.\d+\)/.test(fill ?? '')

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, boxGlance: false })
  for (const theme of ['dark', 'light']) {
    await c.look(theme)
    await page.evaluate(() => window.api.showPrompt())
    await wait(900)
    await page.evaluate(([sel, content]) => document.querySelector(sel).editor.chain().setContent({ type: 'doc', content }).focus('start').run(), [EDITOR, [p('Cost clean-up, done this week.'), table, p('')]])
    await wait(900)
    // The table's block grip, as a hand finds it: the pointer over its first row, then the grip pressed.
    const row = await page.evaluate((sel) => { const r = document.querySelector(`${sel} table tr:nth-child(2) td`).getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 } }, EDITOR)
    await page.mouse.move(row.x, row.y)
    await wait(400)
    const grip = await page.evaluate(() => { const r = document.querySelector('.tiptap-drag-handle')?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })
    check(`${theme}: the table's block grip shows`, !!grip)
    if (grip) {
      await page.mouse.move(grip.x, grip.y)
      await wait(200)
      await page.mouse.down()
      await page.mouse.up()
      await wait(600)
      const menu = await look('.tiptap-block-menu')
      check(`${theme}: the Block menu opens`, !!menu)
      if (menu) {
        if (shots) await page.screenshot({ path: join(shots, `block-menu-${theme}.png`) })
        const seen = await through(menu)
        check(`${theme}: the Block menu is opaque, no blur`, !seeThrough(menu.fill) && menu.blur === 'none', `fill ${menu.fill}, blur ${menu.blur}`)
        check(`${theme}: none of the table's words come through the Block menu`, seen < 0.05, `edges of what comes through ${seen.toFixed(3)}`)
      }
      await page.keyboard.press('Escape')
      await wait(400)
    }
    // The "/" list, opened on the empty line under the table.
    await page.click(EDITOR)
    await page.keyboard.press('Meta+ArrowDown')
    await page.keyboard.type('/')
    await wait(900)
    const list = await look('.tiptap-slash-menu')
    check(`${theme}: the "/" list opens`, !!list)
    if (list) {
      if (shots) await page.screenshot({ path: join(shots, `slash-list-${theme}.png`) })
      const seen = await through(list)
      check(`${theme}: the "/" list is opaque, nothing under it comes through`, !seeThrough(list.fill) && list.blur === 'none' && seen < 0.05, `fill ${list.fill}, blur ${list.blur}, edges ${seen.toFixed(3)}`)
    }
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.api.hidePrompt())
    await wait(500)
  }
  const errors = c.errors.filter((one) => !/Autofill|DevTools/.test(one))
  check('no page errors', !errors.length, errors.slice(0, 2).join(' / '))
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
