// The sidebar's group headings carry no settings icon: pointed at, Tasks'
// heading shows only its name and fold arrow. Which pages show is set in
// "Customize sidebar…" (the menu at the sidebar's foot, or a row's right
// click), which lists every page; a click outside it closes it, and nothing
// else opens or grows.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/sidebar-arrange.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-show-row]')].filter((one) => one.offsetParent).map((one) => one.dataset.showRow))
const open = () => h.evaluate(() => !!document.querySelector('[data-radix-popper-content-wrapper] [data-show-row]'))
try {
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    const head = h.locator('button[data-side-row][aria-expanded]', { hasText: 'Tasks' }).first()
    await head.hover(); await wait(400)
    check(`${theme}: no settings icon on any group heading`, (await h.locator('[data-arrange]').count()) === 0)
    const inRow = await head.evaluate((el) => el.parentElement.querySelectorAll('button').length)
    check(`${theme}: pointed at, Tasks' heading is one button`, inRow === 1, String(inRow))
    await h.screenshot({ path: `${dir}/tasks-heading-${theme}.png` })

    await h.getByRole('button', { name: 'Haligtree menu' }).click(); await wait(400)
    await h.getByRole('menuitem', { name: 'Customize sidebar…' }).click(); await wait(700)
    const all = await rows()
    check(`${theme}: "Customize sidebar…" lists every page`, all.includes('home') && all.includes('today') && all.includes('stats'), `${all.length} rows`)
    await h.screenshot({ path: `${dir}/customize-${theme}.png` })
    // A click outside, on the page: it closes, and the list never changes on its way out.
    const before = all.length
    let grew = false
    const watch = setInterval(() => void rows().then((now) => { if (now.length > before) grew = true }).catch(() => {}), 40)
    await h.mouse.click(900, 500); await wait(700)
    clearInterval(watch)
    check(`${theme}: a click outside closes it`, !(await open()))
    check(`${theme}: and nothing grows or opens on the way out`, !grew && (await h.locator('[data-radix-popper-content-wrapper]').count()) === 0)
  }
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
