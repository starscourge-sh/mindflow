// F (Display) in quick capture with the side panel shut: in the one-line pill and in the grown box, F off the writing
// opens the Inbox's Display as a sheet over the box with a grey dim, though no list is in sight. F in the writing is a
// letter, never Display. With the panel open, Display opens there, by the list, as before.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-display-f.mjs
import { mkdirSync } from 'fs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.SHOTS ?? 'scratchpad/box-display-f'
mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const look = async (name) => { await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name); await wait(400) }
const both = async (name) => { for (const one of ['light', 'dark']) { await look(one); await page.screenshot({ path: `${shots}/${name}-${one}.png` }) } await look('light') }
/** What opened for Display: a sheet (with its shade) or a panel by the list. */
const shown = () => page.evaluate(() => {
  const r = (el) => { const b = el?.getBoundingClientRect(); return b && { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } }
  const shade = document.querySelector('[data-slot="sheet-overlay"]')
  return {
    sheet: r(document.querySelector('[data-slot="sheet-content"]')), pop: r(document.querySelector('[data-slot="popover-content"]')),
    title: document.querySelector('[data-slot="sheet-content"] [data-slot="sheet-title"]')?.textContent ?? '',
    shade: shade ? getComputedStyle(shade).backgroundColor : null, card: r(document.querySelector('.app-container')),
    writing: r(document.querySelector('.app-container .ProseMirror')), pill: !!document.querySelector('[data-pill]'),
    panel: !!document.querySelector('button[aria-label="Hide the side panel"]'), ih: innerHeight, room: getComputedStyle(document.documentElement).getPropertyValue('--mf-room')
  }
})
const offWriting = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await wait(150) }
const dimmed = (shade) => !!shade && shade !== 'rgba(0, 0, 0, 0)' && !/, 0\)$/.test(shade)
const over = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
const clear = async () => { await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(900) }

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  // Opened fresh as the pill, its panel never drawn: the way the user meets it.
  // The full box's panel chosen shut too (boxPanel), so no panel was ever drawn behind the pill: the user's case.
  await page.evaluate(() => localStorage.setItem('boxPanel', 'closed'))
  await page.reload(); await wait(1500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
  let at = await shown()
  check('the pill, the panel shut', at.pill && !at.panel, JSON.stringify(at))

  // F in the writing is a letter.
  await page.click(EDITOR); await page.keyboard.type('f'); await wait(500)
  at = await shown()
  const typed = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', EDITOR)
  check('the pill: F in the writing is a letter', typed === 'f' && !at.sheet && !at.pop, `${JSON.stringify(typed)} ${JSON.stringify(at)}`)
  await clear()

  // The pill: F off the writing opens Display as a sheet, dimmed behind.
  await offWriting(); await page.keyboard.press('f'); await wait(800)
  at = await shown()
  check('the pill: F opens Display as a sheet', !!at.sheet && /Display/.test(at.title), JSON.stringify(at))
  check('the pill: a grey dim behind it', dimmed(at.shade), String(at.shade))
  check('the pill: it grows into the box to hold the sheet, which ends at the card\'s foot', !at.pill && Math.abs(at.sheet?.b - at.card.b) <= 1 && at.card.b - at.card.t > 200, JSON.stringify([at.sheet, at.card]))
  check('the pill: over the writing', over(at.sheet, at.writing) || over(at.sheet, at.card), JSON.stringify([at.sheet, at.writing, at.card]))
  await both('pill-display')
  await page.keyboard.press('Escape'); await wait(600)
  at = await shown()
  check('Esc puts it away, back to the pill', !at.sheet && at.pill, JSON.stringify(at))

  // The grown box, the panel still shut.
  await page.click(EDITOR); await page.keyboard.type('hello'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('world'); await wait(900)
  at = await shown()
  check('grown: the box, the panel shut', !at.pill && !at.panel, JSON.stringify(at))
  await page.keyboard.type('f'); await wait(400)
  check('grown: F in the writing is a letter', /worldf/.test(await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', EDITOR)) && !(await shown()).sheet)
  await offWriting(); await page.keyboard.press('f'); await wait(800)
  at = await shown()
  check('grown: F opens Display as a sheet', !!at.sheet && /Display/.test(at.title), JSON.stringify(at))
  check('grown: a grey dim behind it', dimmed(at.shade), String(at.shade))
  check('grown: over the writing', over(at.sheet, at.writing), JSON.stringify([at.sheet, at.writing]))
  check('grown: the sheet and its shade end at the card\'s foot, none hanging below over the desktop', Math.abs(at.sheet.b - at.card.b) <= 1, JSON.stringify([at.sheet, at.card]))
  await both('grown-display')
  // A choice made in it is the Inbox's: the list shows it once the panel opens.
  const sort = page.locator('[data-slot="sheet-content"] button', { hasText: 'A to Z' }).first()
  if (await sort.count()) { await sort.click(); await wait(400) }
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('view:prompt:captures') ?? '{}').sort)
  check('a choice in it is kept as the Inbox\'s', kept === 'name', String(kept))
  await page.keyboard.press('Escape'); await wait(600)

  // The panel open: Display opens by the list, as before.
  await page.keyboard.press('Meta+\\'); await wait(1200)
  at = await shown()
  check('the panel opens', at.panel, JSON.stringify(at))
  await offWriting(); await page.keyboard.press('f'); await wait(800)
  at = await shown()
  check('panel open: F opens Display', !!(at.pop || at.sheet), JSON.stringify(at))
  check('panel open: only one Display opens', (await page.locator('[data-slot="popover-content"], [data-slot="sheet-content"]').count()) === 1)
  await both('panel-display')
  // Put back: A to Z was this probe's.
  await page.evaluate(() => { const one = JSON.parse(localStorage.getItem('view:prompt:captures') ?? '{}'); one.sort = 'newest'; localStorage.setItem('view:prompt:captures', JSON.stringify(one)) })
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed; frames in ${shots}`)
process.exit(passed === results.length ? 0 : 1)
