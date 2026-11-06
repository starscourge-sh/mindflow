// What runs on its own keeps running when its tab goes: a call recorded (generated audio only, test mode, never the
// microphone or the Mac's sound) and a focus session, each driven through a tab switch, a tab closed and a pane closed.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tabs-sessions.mjs
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const { c, made, card } = await recorded({ repeat: 3, speed: 2 })
const { h, v, electron } = c
const wait = (ms = 500) => h.waitForTimeout(ms)
const row = (name) => h.locator(`[data-side-row][aria-label="${name}"]`).first()
/** The same moves each time: a tab opened, switched, closed; a pane opened and closed. */
const tabMoves = async () => {
  await row('Calendar').click({ modifiers: ['Meta'] }); await wait(400)
  await h.keyboard.press('Control+Tab'); await wait(400)
  await h.keyboard.press('Control+Tab'); await wait(400)
  await h.keyboard.press('Control+w'); await wait(400)
  await row('Goals').click({ modifiers: ['Alt'] }); await wait(600)
  await h.keyboard.press('Control+w'); await wait(600)
  return h.evaluate(() => document.querySelectorAll('[data-split-area] [data-pane]').length)
}
try {
  // --- a recording
  await c.go('articles'); await wait(800)
  const list = h.locator('[data-pane] [data-row][data-id]').first()
  await list.click(); await wait(1000)
  await v('meeting:start', null)
  const m = await card()
  await m.waitForSelector('[data-meeting-card="ready"]', { timeout: 8000 })
  await m.click('[data-meeting-start]')
  await m.waitForSelector('[data-meeting-card="live"]', { timeout: 8000 })
  const clock = () => m.evaluate(() => document.querySelector('[data-meeting-card]')?.innerText ?? '')
  const before = await clock()
  const panes = await tabMoves()
  check('recording: the moves left one pane', panes === 1, String(panes))
  check('recording: still live after a tab switched, a tab closed, a pane closed', (await m.locator('[data-meeting-card="live"]').count()) === 1)
  await wait(1500)
  const after = await clock()
  check('recording: its card still counts up', before !== after, `${before.slice(0, 40)} -> ${after.slice(0, 40)}`)
  await h.screenshot({ path: `${process.env.QA_SHOTS ?? process.env.QA_DATA}/split-tabs/recording-after-moves.png` }).catch(() => {})
  await wait(Math.max(0, (made.seconds / 2) * 1000 - 4000) + 2500)
  await m.click('[data-meeting-stop]')
  await h.waitForSelector('[data-meeting-page]', { timeout: 60000 })
  await wait(1200)
  const page = await h.evaluate(() => ({ text: document.querySelector('[data-meeting-page]')?.innerText ?? '', tabs: document.querySelectorAll('[data-tab]').length, on: document.querySelector('[data-tab-on]')?.getAttribute('data-drag-title') }))
  check('recording: stopped, its note opens with what was said', page.text.length > 20, `${page.text.length} letters, on tab ${page.on}`)

  // --- a focus session
  await c.v('settings:set', { countIn: false, focusShows: 'bubble' })
  const running = await v('focus:start', 25 * 60000, 'Deep work')
  await h.evaluate(() => window.api.showFocus(true))
  let pill = null
  for (let i = 0; i < 50 && !pill; i++) { pill = electron.windows().find((one) => one.url().includes('view=focus')) ?? null; await wait(200) }
  await pill?.waitForSelector('[data-island]', { timeout: 8000 })
  check('focus: the session starts, its bubble up', !!pill && !!running, String(running))
  await wait(2500)
  const said = async () => (await pill.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim()
  const shown = await said()
  const left = await tabMoves()
  check('focus: the moves left one pane', left === 1, String(left))
  await wait(1200)
  const later = await said()
  const open = await pill.locator('[data-island]').count().catch(() => 0)
  check('focus: its bubble stays, saying the same session', open === 1 && later === shown && /Deep work/.test(later), `${shown.slice(0, 40)} -> ${later.slice(0, 40)}`)
  const row0 = await v('session:running').catch(() => null)
  const stillOn = await h.evaluate(() => window.api.haligtree('session:last').catch(() => null))
  check('focus: not ended by any of it', !(row0 && row0.endedAt) && !(stillOn && stillOn.id === running && stillOn.endedAt), JSON.stringify(stillOn)?.slice(0, 120))
  console.log(`bubble: "${shown.slice(0, 50)}" then "${later.slice(0, 50)}"`)
  await v('session:cancel', running)
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
done()
