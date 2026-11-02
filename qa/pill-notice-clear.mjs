// A notice in quick capture's one-line pill never sits over what you type: it goes just above the card, centred on
// it. Checked on a fresh open, and after the box grew (a second line) and went back to the pill, where the grown
// box's own lane for notices was left behind and put the next one over the pill's words.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pill-notice-clear.mjs [shots-dir]
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.argv[2] ?? '/tmp'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false, sounds: false, boxOneLine: true })
  await page.reload()
  await page.waitForTimeout(1500)
  const notice = async (where) => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:job-stopped', { detail: '“5m” stays as words, no timer' })))
    await page.waitForTimeout(600)
    const at = await page.evaluate(() => {
      const toast = document.querySelector('[role=status]')?.getBoundingClientRect()
      const card = document.querySelector('.app-container')?.getBoundingClientRect()
      const words = document.querySelector('.app-container .ProseMirror')?.getBoundingClientRect()
      const r = (one) => one && [Math.round(one.left), Math.round(one.top), Math.round(one.right), Math.round(one.bottom)]
      const hits = [...document.querySelectorAll('.mf-top button')].map((one) => one.getBoundingClientRect()).filter((one) => one.width && toast && one.left < toast.right && one.right > toast.left && one.top < toast.bottom && one.bottom > toast.top).length
      return { pill: !!document.querySelector('.app-container[data-pill]'), toast: r(toast), card: r(card), words: r(words), hits }
    })
    const over = at.toast && at.card && at.toast[1] < at.card[3] && at.toast[3] > at.card[1] && at.toast[0] < at.card[2] && at.toast[2] > at.card[0]
    console.log(`  ${where}: ${JSON.stringify(at)}`)
    check(`${where}: the notice shows, in the pill, clear of the card, its words and its round controls`, at.pill && at.toast && !over && at.hits === 0, JSON.stringify(at))
    for (const look of ['light', 'dark']) {
      await c.look(look)
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:job-stopped', { detail: '“5m” stays as words, no timer' })))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${SHOTS}/pill-notice-${where.replace(/\W+/g, '-')}-${look}.png` }).catch(() => {})
    }
    await c.look('light')
  }
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  await page.keyboard.type('a thought')
  await notice('fresh open')
  // Grown to the box by a second line, then back to one line.
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('a second line')
  await page.waitForTimeout(800)
  const grew = await page.evaluate(() => !document.querySelector('.app-container[data-pill]'))
  console.log(`  grew to the box: ${grew}`)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(800)
  await notice('after the box grew and went back')
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
