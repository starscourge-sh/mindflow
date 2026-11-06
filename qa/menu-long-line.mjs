// A menu line holding a long title is cut short: the menu keeps its width and its keys show (the user, 6 Nov: "why the
// context menu get blown out? is this a widespread issue?").
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/menu-long-line.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const LONG = 'this order makes no sense to me, why would the rest be in front of next, and while we are at it why is this title so very long indeed #haligtree #bug-report'
try {
  const id = await h.evaluate((text) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } }), LONG)
  await v('toTask', id)
  await go('upcoming')
  await wait(1200)
  const line = h.locator('[data-id], [data-task-row]', { hasText: 'this order makes no sense' }).first()
  await line.click({ button: 'right' })
  await wait(500)
  const menu = await h.evaluate(() => {
    const box = document.querySelector('[role="menu"]').getBoundingClientRect()
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    const long = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((one) => one.textContent.includes('this order makes'))
    return { width: Math.round(box.width), most: Math.round(26 * rem), text: long?.textContent ?? '', cut: long ? [...long.querySelectorAll('span')].some((one) => one.scrollWidth > one.clientWidth) : false, tags: long?.textContent.includes('#') }
  })
  check('the menu names the note', menu.text.length > 0, menu.text.slice(0, 60))
  check('a long title never widens the menu', menu.width <= menu.most, JSON.stringify(menu))
  check('its line is cut short', menu.cut)
  check('it says no tags', !menu.tags)
  if (process.env.SHOT) await h.screenshot({ path: join(process.env.SHOT, 'menu-long-line.png') })
  check('no page errors', !c.errors.some((e) => e.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
