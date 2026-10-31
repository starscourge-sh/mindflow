// A long note read inside quick capture ("Back to your note") keeps the house
// rules for a long page: its scrolling edge fades where more is hidden, and
// "Back to top" shows once it is scrolled down and takes it back up.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-read-long.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  // A gem that comes back, opened from its card's menu: read in the box. Then made long.
  await v('settings:set', { hintRate: 1 })
  const lines = Array.from({ length: 90 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Line ${i + 1} of a long read, enough words to fill the line.` }] }))
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { Math.random = () => 0.99; window.api.hidePrompt() })
    await page.waitForTimeout(400)
    await page.evaluate(() => window.api.showPrompt())
    await page.waitForSelector('[data-hint-card]', { timeout: 4000 }).catch(() => {})
    const mark = await page.evaluate(() => document.querySelector('[data-hint-mark]')?.textContent ?? '')
    if (mark && !/Inbox/.test(mark)) break
  }
  await page.click('[data-hint-words]', { button: 'right' }); await page.waitForTimeout(400)
  await page.locator('[role=menu] [role=menuitem]', { hasText: 'Open it' }).first().click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((one) => one.textContent.includes('Back to your note')), null, { timeout: 6000 })
  const id = await page.evaluate(() => document.querySelector('[data-reading-pane] [data-open], [data-open]')?.getAttribute('data-open'))
  await v('item:save', id, { body: { type: 'doc', content: lines } })
  await page.waitForTimeout(1500)
  const scroller = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('.note-pane, .note-pane .haligtree-editor-content')].filter((one) => one.scrollHeight > one.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(one).overflowY))
    const one = all[0]
    return one ? { mask: getComputedStyle(one).maskImage || getComputedStyle(one).webkitMaskImage, top: one.scrollTop } : null
  })
  const before = await scroller()
  check('the long page scrolls in the box, its far edge faded where more is hidden', before && /gradient/.test(before.mask), JSON.stringify(before))
  check('at the top, no "Back to top"', !(await page.locator('[aria-label="Back to top"]').isVisible().catch(() => false)))
  await page.evaluate(() => {
    const one = [...document.querySelectorAll('.note-pane, .note-pane .haligtree-editor-content')].find((el) => el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))
    one?.scrollTo({ top: one.scrollHeight })
  })
  await page.waitForTimeout(900)
  const top = page.locator('[aria-label="Back to top"]')
  check('scrolled down, "Back to top" shows', await top.isVisible().catch(() => false))
  const clear = await page.evaluate(() => {
    const button = document.querySelector('[aria-label="Back to top"]')?.getBoundingClientRect()
    const field = [...document.querySelectorAll('[data-reading-pane] input, [data-reading-pane] textarea, [data-reading-pane] [contenteditable=true]')].map((one) => one.getBoundingClientRect()).filter((one) => one.width > 0 && one.bottom > innerHeight - 160)
    return button && field.every((one) => button.bottom <= one.top || button.top >= one.bottom || button.right <= one.left || button.left >= one.right)
  })
  check('"Back to top" sits clear of the page\'s "Add a thought" bar', clear)
  await page.screenshot({ path: `${shots}/box-read-long-light.png` })
  await c.look('midnight'); await page.waitForTimeout(300)
  await page.screenshot({ path: `${shots}/box-read-long-dark.png` })
  await c.look('light')
  await top.click().catch(() => {})
  await page.waitForTimeout(1200)
  check('…and takes the page back to its top', (await scroller())?.top === 0, JSON.stringify(await scroller()))
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
}
