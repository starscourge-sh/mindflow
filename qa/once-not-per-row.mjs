// A whole-book fact is said once, never on every row: with questions coming back switched off, Questions
// says so in one line under its tabs with a button that turns it on, and no row repeats it; Writing's rows
// do not each say "Comes back now and then". At the narrowest window (the sidebar folded to its icons) a
// milestone never covers a page: it is one line that leaves. 50 groups show six and "Show all 50 groups";
// the icon rail lists Writing's folders and groups in a menu.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-wr/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/once-not-per-row.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, size, close, errors } = s
const shots = process.env.QA_SHOTS
try {
  await v('settings:set', { hintRate: 0.1, questionsBack: false })
  await h.evaluate(() => localStorage.setItem('sidebar:folders:article', 'true'))
  await go('questions')
  await h.waitForTimeout(600)
  const q = await h.evaluate(() => ({
    line: document.querySelectorAll('[data-questions-back-off]').length,
    rows: [...document.querySelectorAll('[role="main"] [data-row]')].filter((one) => /off in Settings/.test(one.textContent)).length
  }))
  check('questions coming back off: said once, under the tabs', q.line === 1, JSON.stringify(q))
  check('and on no row', q.rows === 0, q.rows)
  if (shots) await h.screenshot({ path: `${shots}/questions-back-off.png` })
  await h.locator('[data-questions-back-on]').click()
  await h.waitForTimeout(600)
  check('“Turn it on” turns it on, and the line goes', (await v('settings')).questionsBack === true && await h.locator('[data-questions-back-off]').count() === 0)
  await go('articles')
  await h.waitForTimeout(600)
  const repeats = await h.evaluate(() => [...document.querySelectorAll('[role="main"] [data-row]')].filter((one) => /Comes back now and then/.test(one.textContent)).length)
  check('Writing’s rows do not each say “Comes back now and then”', repeats === 0, repeats)

  // 50 groups.
  const groups = Array.from({ length: 50 }, (_, k) => ({ id: `g${k}`, list: 'article', name: `Group number ${k + 1} with a long name to see`, tags: [`tag${k}`] }))
  await v('settings:set', { smartGroups: groups, hintRate: 0 })
  await h.waitForTimeout(700)
  const side = await h.evaluate(() => ({ shown: document.querySelectorAll('aside [data-side-group]').length, more: document.querySelector('aside [data-groups-more]')?.textContent, wide: document.querySelector('aside')?.scrollWidth > document.querySelector('aside')?.clientWidth }))
  check('50 groups: six listed and “Show all 50 groups”', side.shown === 6 && /Show all 50 groups/.test(side.more ?? ''), JSON.stringify(side))
  if (shots) await h.screenshot({ path: `${shots}/groups-50.png` })
  await h.locator('aside [data-groups-more]').click()
  await h.waitForTimeout(400)
  check('“Show all” lists all 50', await h.locator('aside [data-side-group]').count() === 50)

  // The narrowest window: the icon rail.
  await size(390, 844)
  await h.waitForTimeout(800)
  const width = await h.evaluate(() => window.innerWidth)
  console.log('window width', width)
  await h.locator('aside [data-rail-folders="article"]').click()
  await h.waitForTimeout(500)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [data-heading], [role="menu"] [role="group"]')].map((one) => one.textContent.trim()).filter(Boolean))
  check('the icon rail lists Writing’s folders and groups', menu.some((one) => /History/.test(one)) && menu.some((one) => /Group number 1 /.test(one)), menu.slice(0, 8).join(' | '))
  if (shots) await h.screenshot({ path: `${shots}/rail-menu.png` })
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:celebrate', { detail: { id: 'try:kept', kind: 'kept', rank: 0, line: 'Each one out of your head.', headline: '100 captures kept', mark: '100', tint: 'var(--tt-color-text-blue)' } })))
  await h.waitForTimeout(1500)
  const narrow = await h.evaluate(() => ({ card: !!document.querySelector('[data-celebration] [role="status"]'), toast: [...document.querySelectorAll('li, [data-sonner-toast], [role="status"]')].some((one) => /100 captures kept: Each one out of your head/.test(one.textContent)) }))
  check('narrow: the milestone is one line that leaves, not a card over the page', !narrow.card && narrow.toast, JSON.stringify(narrow))
  if (shots) await h.screenshot({ path: `${shots}/narrow-milestone.png` })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
