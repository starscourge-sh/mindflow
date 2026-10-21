// A group's settings icon in the sidebar arranges that group alone: Tasks'
// icon lists Tasks' pages and nothing else, while "Customize sidebar…" in the
// menu at the sidebar's foot still lists every page.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/sidebar-arrange.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const TASKS = ['today', 'week', 'calendar', 'upcoming', 'matrix', 'routines', 'later', 'tomorrow']

const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-show-row]')].filter((one) => one.offsetParent).map((one) => one.dataset.showRow))
try {
  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await h.locator('[data-arrange="Tasks"]').hover({ force: true })
    await h.locator('[data-arrange="Tasks"]').click({ force: true })
    await wait(600)
    const listed = await rows()
    check(`${theme}: Tasks' settings icon lists only Tasks' pages`, listed.length > 0 && listed.every((id) => TASKS.includes(id)), listed.join(', '))
    check(`${theme}: and names the group it arranges`, await h.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper] p')].some((one) => one.textContent === 'Tasks')))
    await h.screenshot({ path: `${dir}/61-arrange-tasks-${theme}.png` })
    await h.keyboard.press('Escape')
    await wait(500)
    await h.getByRole('button', { name: 'Vigil menu' }).click()
    await wait(400)
    await h.getByRole('menuitem', { name: 'Customize sidebar…' }).click()
    await wait(700)
    const all = await rows()
    check(`${theme}: "Customize sidebar…" still lists every page`, all.includes('home') && all.includes('today') && all.includes('stats'), `${all.length} rows`)
    await h.keyboard.press('Escape')
    await wait(500)
  }
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
