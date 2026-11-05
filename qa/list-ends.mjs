// G and g g in every list with keys of its own (the user, 5 Nov: "no G or gg to navigate"): G goes to
// the last row, g g to the first, as useListKeys does (ui.tsx listEnd). Each surface: open it, step in
// with j, press G (the cursor on the last row), then g g (the first).
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/list-ends.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-list-ends-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
const wait = (ms = 300) => h.waitForTimeout(ms)
/** Which row of `rows` holds the cursor (`mark` on it), and how many there are. */
const where = (rows, mark) => h.evaluate(([rows, mark]) => {
  const all = [...document.querySelectorAll(rows)].filter((one) => one.offsetWidth > 0)
  return { at: all.findIndex((one) => one.matches(mark)), n: all.length }
}, [rows, mark])
const ends = async (name, rows, mark, before = async () => {}) => {
  await before()
  await h.keyboard.press('j'); await wait()
  await h.keyboard.press('Shift+G'); await wait()
  const last = await where(rows, mark)
  // Down a few rows, so g g has somewhere to go.
  for (let i = 0; i < 3; i++) (await h.keyboard.press('j'), await wait(120))
  if ((await where(rows, mark)).at === 0) for (let i = 0; i < 3; i++) (await h.keyboard.press('k'), await wait(120))
  await h.keyboard.press('g'); await h.keyboard.press('g'); await wait()
  const first = await where(rows, mark)
  check(`${name}: G goes to the last row`, last.n > 1 && last.at === last.n - 1, JSON.stringify(last))
  check(`${name}: g g goes to the first`, first.n > 1 && first.at === 0, JSON.stringify(first))
}
const settle = async () => { await h.keyboard.press('Escape'); await wait(200); await h.keyboard.press('Escape'); await wait(200) }

try {
  await c.go('matrix'); await wait(800)
  await h.mouse.move(5, 5)
  await ends('Urgent and important', '[data-row][data-id]', '[data-cursor]')
  await settle()

  await c.go('settings'); await wait(800)
  // The page's controls, as Settings' own j and k count them: each marked in order for the check to read.
  await h.evaluate(() => {
    const column = document.querySelector('[data-setting]')?.closest('.max-w-2xl')
    const controls = [...(column?.querySelectorAll('button, [role="slider"], input') ?? [])].filter((one) => one.tabIndex >= 0 && !one.matches(':disabled') && one.checkVisibility() && !one.matches('input:not([type]), input[type="text"], input[type="search"]'))
    controls.forEach((one) => one.setAttribute('data-qa-control', ''))
    controls[0]?.focus()
  })
  await ends('Settings', '[data-qa-control]', ':focus')
  await settle()


  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:close-week'))); await wait(1200)
  await ends('Close the week', '[data-close-task]', '[data-cursor]')
  await settle()

  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:fits'))); await wait(1200)
  await ends('What fits', '[data-fit-row]', '[data-fit-at]')
  await settle()

  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
