// ⌃L's "Change type…" list shows every row whole wherever there is room, in the one-line pill and the grown box
// alike: never three rows and a faded, cut fourth ("Word") with room to spare under it. Where the room runs out, the
// rows it holds are whole and the list scrolls; no row is ever cut through.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/kind-rows.mjs
import { mkdirSync } from 'fs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? 'scratchpad/kind-rows'
mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const look = async (name) => { await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name); await wait(500) }
/** The list's rows against what of it shows: whole, cut, or out of sight; and the room under it in the window. */
const rows = () => page.evaluate(() => {
  const list = document.querySelector('[data-slot="popover-content"] [cmdk-list]')
  if (!list) return null
  const box = list.getBoundingClientRect()
  const items = [...list.querySelectorAll('[cmdk-item]')].map((one) => one.getBoundingClientRect())
  const whole = items.filter((one) => one.top >= box.top - 0.5 && one.bottom <= box.bottom + 0.5).length
  const cut = items.filter((one) => one.bottom > box.bottom + 0.5 && one.top < box.bottom - 0.5).length
  const pop = document.querySelector('[data-slot="popover-content"]').getBoundingClientRect()
  return { all: items.length, whole, cut, under: Math.round(innerHeight - pop.bottom), pitch: items[1] ? Math.round(items[1].top - items[0].top) : 0 }
})
const both = async (name) => { for (const one of ['light', 'dark']) { await look(one); await page.screenshot({ path: `${shots}/${name}-${one}.png` }) } await look('light') }

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await page.evaluate(() => localStorage.setItem('boxPanel', 'closed'))
  await page.reload(); await wait(1500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(900)
  await page.keyboard.type('Pill words'); await wait(500)
  for (const [where, grow] of [['pill', false], ['grown box', true]]) {
    if (grow) { await page.keyboard.press('Shift+Enter'); await page.keyboard.type('two lines'); await wait(1000) }
    await page.keyboard.press('Control+l'); await wait(1200)
    const at = await rows()
    check(`${where}: the list opens`, !!at, JSON.stringify(at))
    check(`${where}: no row cut through`, at && at.cut === 0, JSON.stringify(at))
    // All of them whole, unless the window has no room left under the list for even one more row.
    check(`${where}: every row whole where there is room`, at && (at.whole === at.all || at.under < at.pitch), JSON.stringify(at))
    await both(grow ? 'grown-box-kind' : 'pill-kind')
    await page.keyboard.press('Escape'); await wait(600)
    await page.click(EDITOR); await page.keyboard.press('End'); await wait(300)
  }
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed; frames in ${shots}`)
process.exit(passed === results.length ? 0 : 1)
