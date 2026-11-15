// Wikipedia from quick capture's own ⌘K, as from the main window's (qa/wiki-reader.mjs): the line under your results,
// nothing asked until it is picked, its answers in place, and ↵ on one reading it in the app. Frames of the box in
// light and dark. Wikipedia is a stand-in (qa/wiki-stand-in.mjs).
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/wiki-in-box.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const searches = () => site.asked.filter((one) => one.includes('/w/rest.php/v1/search/page'))
const until = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
try {
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  await v('settings:set', { sounds: false, hintRate: 0, motion: false })
  await h.evaluate(() => window.api.showPrompt())
  await wait(900)
  await page.keyboard.press('Meta+k'); await wait(500)
  await page.keyboard.type('roman empire', { delay: 30 }); await wait(900)
  const line = await page.evaluate(() => document.querySelector('[data-look="wikipedia"][data-look-kind="line"]')?.textContent ?? null)
  check('quick capture\'s ⌘K offers “Search Wikipedia for “roman empire””', line === 'Search Wikipedia for “roman empire”', JSON.stringify(line))
  check('nothing is sent to Wikipedia while typing', searches().length === 0, JSON.stringify(site.asked))
  await c.both(`${shots}/w4-box-cmdk-line`, page)
  const picked = await page.evaluate(() => {
    const row = document.querySelector('[data-look="wikipedia"][data-look-kind="line"]')
    if (!row) return false
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  const answered = picked && (await until(() => page.evaluate(() => document.querySelectorAll('[data-look="wikipedia"][data-look-kind="hit"]').length > 0)))
  check('picked: its answers come in place of the line, asked once with the words alone', answered && searches().length === 1 && searches()[0].includes('roman'), JSON.stringify(searches()))
  await c.both(`${shots}/w4-box-cmdk-hits`, page)
  if (answered) {
    await page.keyboard.press('Enter')
    const read = await until(() => h.evaluate(() => !!document.querySelector('.web-reader-heading')))
    check('↵ on an answer reads it in the app (the main window\'s reader)', read)
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  await site.close?.()
}
done()
