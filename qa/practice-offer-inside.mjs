// A practice's offer inside the window. In the sandbox nothing is raised over the desktop: the offer is on Home's
// “Now” card, marked as the example person's (“Their practice at 21:00”), with the corner card's three answers; from
// any other page it is the window's own notice with “Start”. The practice's name is the line and “5 min” a mark of
// its own. Offered past the hour it says how late. One surface at a time; a popover open elsewhere closes when an
// answer is pressed; Esc takes nothing away; a session, a meeting, quiet hours and safe mode hold it; two due at
// once are asked one at a time; the window at 560 by 400 still shows all three answers.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox SHOT=<dir> node qa/practice-offer-inside.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.SHOT ?? 'scratchpad/practice-offer'
mkdirSync(SHOT, { recursive: true })

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800, at: '21:02' })
const { electron, h, v } = c
// The practice is due as the app starts, so it is asked while the window is still loading: nothing may be left over from that.
const wait = (ms) => new Promise((go) => setTimeout(go, ms))
const up = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).map((w) => w.webContents.getURL().split('?')[1] ?? ''))
const cornerUp = async () => (await up()).some((one) => one.includes('view=nudge'))
const card = '[data-practice-now]'
const cardSays = () => h.$eval(card, (one) => ({
  lead: one.querySelector('[data-practice-lead]')?.textContent ?? '', name: one.querySelector('[data-practice-name]')?.textContent ?? '',
  length: one.querySelector('[data-practice-length]')?.textContent ?? '', buttons: [...one.querySelectorAll('button')].map((b) => b.textContent.trim()), all: one.textContent
})).catch(() => null)
const notices = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].filter((one) => one.getBoundingClientRect().width > 0).map((one) => one.textContent.trim()).filter(Boolean))
/** What floats in the window now: popovers and menus, and the notice. */
const floating = () => h.evaluate(() => {
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0' }
  return {
    pops: [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].filter(shown).length,
    notices: [...document.querySelectorAll('[role="status"]')].filter((el) => shown(el) && el.textContent.trim()).length
  }
})
const offered = async () => { for (let i = 0; i < 40; i++) { if (await h.$(card)) return true; await wait(150) } return false }
const gone = async () => { for (let i = 0; i < 40; i++) { if (!(await h.$(card))) return true; await wait(150) } return false }

try {
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', focusTools: true, notify: 'alerts', quietStart: '00:00', quietEnd: '00:00' })
  await c.go('home')
  const first = await v('practices:check')
  check('at 21:02 the example book’s practice of 21:00 is offered', /Read twenty pages/i.test(first?.name ?? '') && first?.at === '21:00', JSON.stringify(first))
  check('on Home’s “Now” card', await offered())
  await wait(2500)
  // --- Ruling 7: the sandbox keeps it to itself.
  check('nothing is raised over the desktop: no card window is up', !(await cornerUp()), JSON.stringify(await up()))
  let said = await cardSays()
  check('marked as the example person’s: “Their practice at 21:00.”', said?.lead === 'Their practice at 21:00.', JSON.stringify(said?.lead))
  // --- Ruling 9: the name is the line; its length is a mark of its own.
  check('the practice’s name is the line, and “5 min” its own mark: no “…, 5 minutes?”', said?.name === first.name && said?.length === '5 min' && !/minutes\?/.test(said?.all ?? ''), JSON.stringify(said))
  check('with “Start”, “Not tonight” and “In 30 min”', JSON.stringify(said?.buttons) === JSON.stringify(['Start', 'Not tonight', 'In 30 min']), JSON.stringify(said?.buttons))
  check('every one of them shows the hand', await h.$$eval(`${card} button`, (all) => all.every((one) => getComputedStyle(one).cursor === 'pointer')))
  // --- Ruling 6: one surface: the card asks, so no notice does.
  check('one surface: the window’s notice says nothing while Home’s card asks', (await notices()).every((one) => !/practice/i.test(one)), (await notices()).join(' | '))
  check('it is the first card of “Now”', await h.evaluate(() => { const slot = document.querySelector('[data-now-slot]'); const shown = [...slot.querySelectorAll('[data-now]')].filter((one) => !one.hasAttribute('data-now-later') && one.getBoundingClientRect().height > 0); return !!shown[0]?.querySelector('[data-practice-now]') }))
  for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: `${SHOT}/now-card-${look}.png` }) }
  // --- Esc takes nothing away.
  await h.keyboard.press('Escape')
  await wait(400)
  check('Esc leaves the offer where it is', !!(await h.$(card)) && !!(await v('practices:offer')))
  // --- The window at 560 by 400: all three answers still in reach.
  await c.size(560, 400)
  await wait(500)
  const small = await h.$eval(card, (one) => { const r = one.getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, buttons: [...one.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth && q.width > 0 }) } })
  check('at 560 by 400 the card and its three answers are whole inside the window', small.right <= small.width && small.buttons.length === 3 && small.buttons.every(Boolean), JSON.stringify(small))
  await h.screenshot({ path: `${SHOT}/now-card-560.png` })
  await c.size(1200, 800)
  await wait(500)

  // --- A popover open elsewhere, and an answer pressed: one floating thing or none, never two.
  let opened = ''
  // Popovers only: a menu here holds the whole window until it is closed, so nothing beside it can be pressed at all.
  for (const trigger of await h.$$('[data-slot="popover-trigger"]')) {
    if (!(await trigger.isVisible().catch(() => false))) continue
    await trigger.click().catch(() => {})
    await wait(400)
    if ((await floating()).pops > 0) { opened = (await trigger.getAttribute('aria-label')) ?? (await trigger.textContent()) ?? 'a popover'; break }
  }
  check('a popover is up on Home, beside the offer', !!opened && (await floating()).pops === 1, `${opened} ${JSON.stringify(await floating())}`)
  await h.click(`${card} [data-practice-later]`)
  await wait(900)
  let floats = await floating()
  check('“In 30 min” pressed with a popover up: one floating thing or none, never two', floats.pops + floats.notices <= 1, JSON.stringify(floats))
  check('it says so in the window’s notice, with Undo', (await notices()).some((one) => /again in 30 minutes/.test(one) && /Undo/.test(one)), (await notices()).join(' | '))
  check('and the offer leaves the card: nothing lost, it is asked again in 30 minutes', (await gone()) && (await v('practices:offer')) === null)
  await h.screenshot({ path: `${SHOT}/answered-notice.png` })
  await h.keyboard.press('Meta+z')
  check('⌘Z takes the answer back: the offer is on the card again', await offered(), JSON.stringify(await v('practices:offer')))

  // --- From any other page: the window's own notice, with “Start”; never both.
  // A task's own page, with its date picker.
  const open = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  await c.send('task', open.id)
  await h.waitForSelector('[data-date-picker]', { timeout: 6000 }).catch(() => {})
  await wait(600)
  check('away from Home there is no “Now” card', !(await h.$(card)))
  await h.locator('[data-date-picker]').first().click({ timeout: 4000 }).catch(() => {})
  await wait(500)
  const picker = (await floating()).pops
  await v('practices:answer', first.id, 'later')
  await v('practices:unanswer', first.id)
  let notice = ''
  for (let i = 0; i < 40 && !notice; i++) { notice = (await notices()).find((one) => /practice/i.test(one)) ?? ''; if (!notice) await wait(150) }
  check('from another page the window’s own notice asks, in one line', /^Their practice at 21:00: Read twenty pages before bed, 5 min to start/.test(notice), notice)
  check('with “Start” on it', /Start/.test(notice.replace(/to start/, '')), notice)
  check('and still no card window over the desktop', !(await cornerUp()))
  await h.screenshot({ path: `${SHOT}/notice-on-tasks.png` })
  check('a task’s date picker was up as it came', picker === 1, `${picker} popovers`)
  await h.locator('[role="status"] button', { hasText: 'Start' }).first().click()
  await wait(1200)
  floats = await floating()
  check('“Start” pressed with a task’s date picker up: one floating thing or none, never two', floats.pops + floats.notices <= 1, JSON.stringify(floats))
  const running = await v('focus:now')
  check('“Start” starts the practice', !!running?.id, JSON.stringify(running)?.slice(0, 120))

  // --- A session running: nothing is offered.
  await v('practices:unanswer', first.id)
  check('while a session runs nothing is offered', (await v('practices:check')) === null && !(await cornerUp()))
  if (running?.id) await v('session:cancel', running.id)
  await h.evaluate(() => window.api.showFocus(false))
  await c.go('home')
  check('the session over, it is offered again on Home', !!(await v('practices:check')) && (await offered()))

  // --- A meeting, quiet hours, safe mode: Haligtree volunteers an offer, so it waits (a task's alert does not).
  await electron.evaluate(() => globalThis.haligtreeSignal('camera', true))
  await wait(400)
  check('in a meeting the offer waits', (await v('practices:check')) === null && (await gone()))
  await electron.evaluate(() => globalThis.haligtreeSignal('camera', false))
  await wait(400)
  check('the meeting over, it is offered', !!(await v('practices:check')) && (await offered()))
  await v('settings:set', { quietStart: '20:00', quietEnd: '23:30' })
  check('in quiet hours it waits', (await v('practices:check')) === null && (await gone()))
  await v('settings:set', { quietStart: '00:00', quietEnd: '00:00' })
  check('quiet hours over, it is offered', !!(await v('practices:check')) && (await offered()))
  await v('settings:set', { safeMode: true })
  check('in safe mode it waits', (await v('practices:check')) === null)
  await v('settings:set', { safeMode: false })
  check('safe mode off, it is offered', !!(await v('practices:check')) && (await offered()))

  // --- Two due at once: one at a time.
  const made = await v('task:add', 'Stretch every day at 21:00')
  const second = await v('practices:set', made?.id ?? made, { on: true })
  await v('practices:check')
  await wait(600)
  check('two due at once: one card, the first', (await h.$$(card)).length === 1 && (await cardSays())?.name === first.name, JSON.stringify(await cardSays()))
  await h.click(`${card} [data-practice-skip]`)
  await wait(700)
  check('“Not tonight” says so, with Undo', (await notices()).some((one) => /Not tonight\./.test(one) && /Undo/.test(one)), (await notices()).join(' | '))
  await v('practices:check')
  for (let i = 0; i < 30 && (await cardSays())?.name === first.name; i++) await wait(150)
  const next = await cardSays()
  check('answered, the other is asked next', !!second?.id && /Stretch/.test(next?.name ?? ''), JSON.stringify(next))
  await v('practices:answer', second.id, 'skip')
  check('answered from elsewhere (not the card), its card goes', await gone())

  // --- The sandbox's review reminder keeps to the window too.
  await h.evaluate(() => window.api.nudge({ kind: 'review', text: '12 cards, about 5 minutes', again: false }))
  let review = ''
  for (let i = 0; i < 30 && !review; i++) { review = (await notices()).find((one) => /review/i.test(one)) ?? ''; if (!review) await wait(150) }
  check('the sandbox’s review reminder is said by the window’s notice, as theirs, with “Review now”', /^Time for their review: 12 cards, about 5 minutes/.test(review) && /Review now/.test(review), review)
  check('and raises no card over the desktop', !(await cornerUp()), JSON.stringify(await up()))

  // --- Ruling 8: offered past the hour, it says how late.
  await v('practices:unanswer', first.id)
  const target = new Date(); target.setHours(23, 22, 0, 0)
  const offset = target.getTime() - Date.now()
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
  await h.evaluate(([code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), offset])
  await c.go('settings')
  await v('practices:check')
  await c.go('home')
  await offered()
  said = await cardSays()
  check('at 23:22 the card says how late: “Their practice at 21:00, 2 hours ago.”', said?.lead === 'Their practice at 21:00, 2 hours ago.', JSON.stringify(said?.lead))
  await h.screenshot({ path: `${SHOT}/now-card-late.png` })
  check('no errors in the window', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
