// Stats is short: "At a glance" holds four or five parts, "Pages you open
// most" and "How you find things" among them; "Your month" and "Your year"
// hold the rest. Every part is on exactly one of the three, the chips never
// move as you switch, each page draws whole, and the month's and the year's
// play-backs are still a click away.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/stats-short.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const shown = () => h.$$eval('section[data-group]', (all) => all.filter((one) => one.checkVisibility()).map((one) => one.dataset.group))
const chip = (name) => h.locator(`button[aria-pressed][aria-label="${name}"]`).first()
const spot = () => h.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].filter((one) => /At a glance|Your month|Your year/.test(one.getAttribute('aria-label'))).map((one) => Math.round(one.getBoundingClientRect().x)).join(','))
try {
  await v('settings:set', { motion: false })
  await go('stats')
  await h.waitForTimeout(1200)
  const glance = await shown()
  check('"At a glance" holds four or five parts', glance.length >= 4 && glance.length <= 5, glance.join(' | '))
  check('with "Pages you open most" and "How you find things"', glance.includes('Pages you open most') && glance.includes('How you find things'))
  const at = await spot()
  const pages = { glance }
  for (const name of ['Your month', 'Your year']) {
    // Watched from the click: a part once drawn is never taken away again (no page drawn twice).
    await h.evaluate(() => {
      window.__seen = []
      window.__watch = new MutationObserver(() => window.__seen.push([...document.querySelectorAll('section[data-group]')].filter((one) => getComputedStyle(one).visibility === 'visible').map((one) => one.dataset.group).join('|')))
      window.__watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
    })
    await chip(name).click()
    await h.waitForTimeout(1000)
    const frames = await h.evaluate(() => (window.__watch.disconnect(), [...new Set(window.__seen)]))
    pages[name] = await shown()
    check(`"${name}" holds the rest of its parts`, pages[name].length >= 3, pages[name].join(' | '))
    // Laid out hidden until read is fine; what counts is that no other set of parts was ever on show.
    check(`"${name}" draws once`, frames.filter((one) => one).every((one) => one === pages[name].join('|')), JSON.stringify(frames))
    check(`the chips stay put on "${name}"`, (await spot()) === at, `${at} then ${await spot()}`)
    check(`"${name}" offers its play-back`, (await h.locator('[data-stats-recap] button').count()) === 1)
  }
  const every = [...pages.glance, ...pages['Your month'], ...pages['Your year']]
  check('every part is on exactly one page', new Set(every).size === every.length, every.join(' | '))
  const want = ['Today', 'This week', 'Remembering, the last 30 days', 'The week, in the work', 'The doing, this week', 'Where captures go', 'Days you opened it', 'Is it working', 'When you capture', 'What you capture']
  const lost = want.filter((name) => !every.includes(name))
  check('nothing was lost', !lost.length, lost.join(', '))
  console.log(`     At a glance: ${pages.glance.join(' | ')}\n     Your month: ${pages['Your month'].join(' | ')}\n     Your year: ${pages['Your year'].join(' | ')}`)
  // The year's play-back opens over the page.
  await h.locator('[data-stats-recap] button').click()
  await h.waitForTimeout(1200)
  check('"Your year, page by page" opens the year', (await shown()).length === 0 || /year/i.test(await h.evaluate(() => document.body.innerText.slice(0, 2000))))
  await h.keyboard.press('Escape')
  check('no page errors', !c.errors.length, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()
