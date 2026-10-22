// Quick capture only catches. On a deciding day, with old captures waiting,
// the box shows no "Deciding day" notice, no "old captures" chip and no "Old
// captures to tidy" panel; the Inbox page shows each as one quiet line at the
// top, and its button opens the pass. The box's note sits in the same place
// whether there is anything to tidy or decide or not. A quote's source is
// said once, in its Who and Where fields (kept from box-deciding.mjs).
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-catches-only.mjs
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const c = await sandbox({ width: 1000, height: 700 })
const { h, page, v, go } = c
// Tomorrow at noon: a fresh day, out of quiet hours, so nothing is held back.
const noon = new Date()
noon.setDate(noon.getDate() + 1)
noon.setHours(12, 0, 0, 0)
await c.electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), noon.getTime() - Date.now()])
await c.electron.context().addInitScript(`(${shiftClock.toString()})(${noon.getTime() - Date.now()})`)
try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), welcoming: false })
  await v('settings:set', { weeklyReview: true, weeklyDay: noon.getDay(), examNudges: false, goalNudges: false, dailyTidy: false, rotCount: 2 })
  // Something set aside, so deciding day has something to decide.
  const open = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
  if (!(await v('pass:waiting')).decide && open[0]) await v('pass:back', open[0].id, true)
  const waiting = await v('pass:waiting')
  const old = await v('rot:waiting')
  check('the sandbox has old captures and something to decide', old > 0 && waiting.decide > 0, `old ${old}, decide ${waiting.decide}`)
  await h.reload()
  await page.reload()
  await h.waitForTimeout(2500)

  const boxSays = async () => {
    await h.evaluate(() => window.api.hidePrompt())
    await page.waitForTimeout(600)
    await h.evaluate(() => window.api.showPrompt())
    await page.waitForTimeout(3000)
    return page.evaluate((sel) => ({
      text: document.body.innerText,
      chip: document.querySelector('[data-waiting]')?.textContent ?? '',
      top: Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? -1)
    }), EDITOR)
  }
  const box = await boxSays()
  check('the box has no "Deciding day" notice', !/Deciding day/.test(box.text) && !/Decide now/.test(box.text))
  check('the box has no old captures chip', !/old capture/.test(box.chip), box.chip || 'no chip')
  // Its side panel's Inbox: pins and the list, no old captures panel.
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(900)
  const panel = await page.evaluate(() => document.body.innerText)
  check('the side panel has no "Old captures to tidy"', !/Old captures to tidy|old captures? to tidy/.test(panel))
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(600)

  // The Inbox page: one quiet line each, in from the first frame.
  await go('settings')
  await go('inbox')
  await h.waitForTimeout(600)
  const lines = await h.evaluate(() => [...document.querySelectorAll('[data-inbox-line]')].map((one) => `${one.dataset.inboxLine}: ${one.textContent}`))
  check('the Inbox says the old captures in one line', lines.some((one) => /^old: \d+ old captures? to tidy\. Tidy them/.test(one)), lines.join(' | '))
  check('the Inbox says deciding day in one line', lines.some((one) => /^decide: Deciding day: .*Decide now/.test(one)), lines.join(' | '))
  const tall = await h.evaluate(() => [...document.querySelectorAll('[data-inbox-line]')].map((one) => Math.round(one.getBoundingClientRect().height)))
  check('each is a single line', tall.every((one) => one <= 34), tall.join(', '))
  await go('inbox')
  // Tidy them opens the pass.
  await h.locator('[data-inbox-line="old"] button', { hasText: 'Tidy them' }).click()
  await h.waitForTimeout(900)
  const pass = await h.evaluate(() => document.querySelector('[data-pass]')?.getAttribute('aria-label') === 'Tidy')
  check('"Tidy them" opens the tidy pass', pass)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  // Not today: the line goes, and stays gone on the next visit.
  await h.locator('[data-inbox-line="decide"]').hover()
  await h.locator('[data-inbox-line="decide"] button[aria-label="Not today"]').click()
  await h.waitForTimeout(400)
  await go('settings')
  await go('inbox')
  check('"Not today" puts the deciding line away', !(await h.locator('[data-inbox-line="decide"]').count()))

  // The box's note sits where it sat, with nothing to tidy or decide.
  await v('settings:set', { weeklyReview: false, rotCount: 0 })
  const bare = await boxSays()
  check('the box\'s note is in the same place with nothing waiting', bare.top === box.top && box.top > 0, `${box.top} then ${bare.top}`)

  // A quote's source: once, in its fields.
  await page.click(EDITOR)
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('"The unexamined life is not worth living." - Socrates, Apology', { delay: 5 })
  await page.waitForTimeout(800)
  const said = await page.evaluate(() => ({ will: document.querySelector('[data-will-do]')?.textContent ?? '', signature: !!document.querySelector('[data-will="signature"]'), fields: [...document.querySelectorAll('input')].map((one) => one.value).join('|') }))
  check('the quote\'s source is in its fields, and not again under "This will"', !said.signature && !/Said by/.test(said.will) && /Socrates/.test(said.fields), JSON.stringify(said))
  await page.keyboard.press('Meta+A')
  await page.keyboard.press('Backspace')
} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
done()
