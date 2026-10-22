// Letters to future you: "@1y" (and @6m, @2w...) in quick capture lights as a
// command word, can be kept as plain text, and sent, the note is kept without
// it, hidden until that day. Its details show the day. With the clock moved
// forward to that day, it is back: in the Inbox, and leading Home with
// "You wrote this a year ago".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/letter-later.mjs
import { checks } from './harness.mjs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const { check, done } = checks()
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const c = await sandbox({ width: 1200, height: 820 })
const { qa, page, h, v, go, send } = c
const wait = (ms = 450) => page.waitForTimeout(ms)
const key = (d) => d.toLocaleDateString('en-CA')
const lit = (kind) => page.locator(`${EDITOR} .box-token[data-box-token="${kind}"]`).count()
const willDo = () => page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await wait(200)
  await qa.reset()
  await page.evaluate(() => localStorage.clear())
}
const type = async (words) => (await page.keyboard.type(words, { delay: 15 }), wait())
const listed = () => h.evaluate(() => window.api.captures.list())
const hidden = () => v('snoozed:back')

try {
  const now = new Date()
  const year = new Date(now); year.setFullYear(now.getFullYear() + 1)
  const weeks = new Date(now); weeks.setDate(now.getDate() + 14)

  // 1. Lit as you type, and what it will do said under the box.
  await fresh()
  await type('The farm idea still feels right @1y')
  check('1. @1y is lit', (await lit('later')) === 1)
  check('1. the line under the box says when it comes back', (await willDo()).includes('Back to you') && (await willDo()).includes(String(year.getFullYear())), await willDo())
  // The @ link menu stays shut for it.
  check('1. no link menu for @1y', !(await page.$('.tiptap-suggestion-popup:visible')))

  // 2. Kept plain by a click, lit again by ⌘Z.
  await page.click(`${EDITOR} .box-token[data-box-token="later"]`)
  await wait()
  check('2. a click keeps it plain', (await lit('later')) === 0)
  await page.keyboard.press('Meta+z')
  await wait()
  check('2. ⌘Z lights it again', (await lit('later')) === 1)

  // 3. Sent lit: kept without "@1y", hidden until a year from now.
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(1500)
  const away = (await hidden()).find((one) => one.title.includes('The farm idea'))
  check('3. hidden until a year from today', away?.day === key(year), JSON.stringify(away))
  check('3. kept without the command word', away && !away.title.includes('@1y'), away?.title)
  check('3. out of the Inbox till then', !(await listed()).some((one) => one.id === away?.id))

  // 4. Kept plain and sent: an ordinary note, words and all.
  await fresh()
  await type('Plain words @2w stay')
  await page.click(`${EDITOR} .box-token[data-box-token="later"]`)
  await wait()
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(1500)
  const plain = (await listed()).find((one) => (one.label ?? '').includes('Plain words'))
  check('4. kept plain: in the Inbox now, with its words', plain && plain.label.includes('@2w') && !plain.snoozedUntil, JSON.stringify(plain && { label: plain.label, s: plain.snoozedUntil }))

  // 5. @2w lands two weeks out.
  await fresh()
  await type('Two weeks on @2w')
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(1500)
  check('5. @2w lands in two weeks', (await hidden()).find((one) => one.title.includes('Two weeks on'))?.day === key(weeks))

  // 6. Its details show the day, with the year, and can change it.
  await send('capture', away.id)
  await h.waitForTimeout(2000)
  if (!(await h.$('[data-show-again]'))) await h.click('button[aria-label="Details"]').catch(() => {})
  await h.waitForTimeout(800)
  if (process.env.SHOT) await h.screenshot({ path: `${process.env.SHOT}/letter-details.png` })
  const until = await h.textContent('[data-hidden-until]').catch(() => '')
  check('6. details say the day, with its year', until?.includes(String(year.getFullYear())), until)
  check('6. details offer another day', !!(await h.$('[data-show-again]')))

  // 7. The clock moved to that day: it is back, and says when it was written.
  const target = new Date(`${key(year)}T12:00:00`)
  const offset = target.getTime() - Date.now()
  await c.electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
  await c.electron.context().addInitScript(`(${shiftClock.toString()})(${offset})`)
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await h.waitForTimeout(2500)
  const back = (await listed()).find((one) => one.id === away.id)
  check('7. back in the Inbox on its day', !!back, JSON.stringify(back && back.snoozedUntil))
  await go('home')
  await h.waitForTimeout(1500)
  const home = await h.textContent('body')
  check('7. Home says “You wrote this a year ago”', home.includes('You wrote this a year ago'), home.match(/You wrote this[^.]{0,30}/)?.[0])
  check('7. Home leads with it', home.indexOf('You wrote this a year ago') < home.indexOf('The farm idea still feels right') + 200)
  check('no page errors', !c.errors.filter((one) => one.includes('PAGEERROR')).length, c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
