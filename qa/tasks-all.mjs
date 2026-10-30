// Tasks' "All" tab: every open task in one list, grouped by when (Overdue, Today, Tomorrow, This week, Later,
// No date), reached from the tab row, G * and ⌘K; and every tab's own sort and group button in the bar,
// offering only what applies there (no "Scheduled" on Later, no "Due by" on Routines).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/tasks-all.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// The list draws only the rows in sight: scrolled through, top to bottom, its headings and words gathered.
const gather = () => h.evaluate(async () => {
  const seen = [], words = new Set()
  const page = document.querySelector('[data-page]')
  const scroller = [...page.querySelectorAll('*')].find((one) => one.scrollHeight > one.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(one).overflowY))
  for (let y = 0; y <= (scroller?.scrollHeight ?? 0); y += 300) {
    if (scroller) scroller.scrollTop = y
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    for (const one of page.querySelectorAll('h2')) { const t = one.firstChild?.textContent?.trim(); if (t && !seen.includes(t)) seen.push(t) }
    words.add(page.innerText)
  }
  if (scroller) scroller.scrollTop = 0
  return { seen, text: [...words].join(' ') }
})
const headings = async () => (await gather()).seen
const sorts = async () => {
  await h.locator('[data-page] header [data-display]').first().click(); await wait(500)
  const words = await h.evaluate(() => (document.querySelector('[data-slot="popover-content"]')?.innerText ?? '').replace(/\s+/g, ' '))
  await h.keyboard.press('Escape'); await wait(300)
  return words
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const words of ['Pay the gas bill yesterday', 'Call the bank today', 'Water the plants tomorrow', 'Learn Welsh someday', 'Sort the loft'])
    await v('task:add', words)
  await go('today'); await wait(600)
  const tabs = await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].map((one) => one.innerText.replace(/\s+/g, '')))
  check('Tasks has an "All" tab, last', tabs.at(-1)?.startsWith('All'), tabs.join())
  await h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].at(-1)?.click()); await wait(1200)
  const all = await headings()
  check('All groups by when', ['Overdue', 'Today', 'Tomorrow', 'Later', 'No date'].every((one) => all.includes(one)), all.join(' / '))
  const order = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date'].filter((one) => all.includes(one))
  check('in the order of when', order.join() === all.filter((one) => order.includes(one)).join(), all.join(' / '))
  const { text } = await gather()
  check('every open task is on it', ['Pay the gas bill', 'Call the bank', 'Water the plants', 'Learn Welsh', 'Sort the loft'].every((one) => text.includes(one)))
  await h.screenshot({ path: `${process.env.QA_DATA}/all-light.png` })
  await go('inbox'); await wait(400)
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('g'); await h.keyboard.type('*'); await wait(1200)
  check('G * opens All', (await headings()).includes('No date'))
  for (const tab of ['today', 'upcoming', 'later', 'routines', 'alltasks']) {
    await go(tab); await wait(500)
    check(`${tab}: a sort and group button in the bar`, (await h.locator('[data-page] header [data-display]').count()) === 1)
  }
  await go('later'); await wait(500)
  const later = await sorts()
  check('Later offers no "Scheduled" sort, but groups by list', !later.includes('Scheduled') && later.includes('By list'), later.slice(0, 160))
  await go('routines'); await wait(500)
  const routines = await sorts()
  check('Routines offers no "Due by" sort', !routines.includes('Due by'), routines.slice(0, 160))
  await h.evaluate(() => localStorage.setItem('theme', 'dark'))
  await h.reload(); await wait(2000)
  await go('alltasks'); await wait(1000)
  await h.screenshot({ path: `${process.env.QA_DATA}/all-dark.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
