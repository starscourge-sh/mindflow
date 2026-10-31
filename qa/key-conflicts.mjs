// One key, one meaning: a tool that is up with keys of its own is asked before the app's own single
// letters (lib/tool-keys.ts, asked first by home.tsx), and the key after G belongs to the G chord.
//   1. a toast's own key C runs its step and does not also open quick capture (the app's C);
//   2. G then a toast's letter (A) goes to Writing and does not also run the toast's step;
//   3. in Review, G then A goes to Writing and does not also set the card aside (Review's A);
//   4. with no tool up, C still opens quick capture and G A still goes to Writing.
// The reader's bar keys (C on a snip or picked words) are checked in qa/snip-card-key.mjs.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/key-conflicts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
/** Quick capture asked for since the last look: main counts each ask. */
const capturing = () => electron.evaluate(() => { const asked = globalThis.qaPrompts > 0; globalThis.qaPrompts = 0; return asked })
const hidePrompt = async () => (await h.evaluate(() => window.api.hidePrompt()), await h.bringToFront(), await wait(300))
const title = async () => (await wait(600), (await h.textContent('[data-pane-title]').catch(() => ''))?.trim())
/** A toast with a next step on its own key, as the app's own toasts have ("Close the day" on C). */
const toastWith = (key) => h.evaluate((key) => {
  window.qaRan = ''
  window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: 'A probe toast', tone: 'info', action: { label: 'Probe step', key, run: () => (window.qaRan = key) } } }))
}, key)
const ran = () => h.evaluate(() => window.qaRan)
const calm = async () => (await h.evaluate(() => (document.activeElement instanceof HTMLElement && document.activeElement.blur(), getSelection()?.removeAllRanges())), await wait(200))

try {
  await electron.evaluate(({ ipcMain }) => void (globalThis.qaPrompts = 0, ipcMain.on('prompt:show', () => globalThis.qaPrompts++)))
  await v('settings:set', { sounds: false, hintRate: 0 })
  await wait(1200)
  await calm()

  // 1. A toast's C.
  await toastWith('c'); await wait(400)
  await h.keyboard.press('c'); await wait(700)
  check('a toast\'s own key C runs its step', (await ran()) === 'c', String(await ran()))
  check('…and does not also open quick capture', !(await capturing()), '')
  await hidePrompt(); await calm()

  // 2. G then a toast's letter.
  await toastWith('a'); await wait(400)
  await h.keyboard.press('g'); await h.keyboard.press('a')
  check('G A with a toast up goes to Writing', (await title()) === 'Writing', await title())
  check('…and does not also run the toast\'s A', (await ran()) === '', String(await ran()))
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:untoast'))); await calm()

  // 3. Review: G then A.
  const note = await v('article:new')
  await v('item:save', note, { title: 'Facts', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What colour is the sky? :: Blue' }] }] } })
  await wait(800)
  await h.keyboard.press('g'); await h.keyboard.press('r')
  check('G R goes to Review', (await title()) === 'Review', await title())
  await calm()
  const cardsBefore = JSON.stringify((await v('items', 'card')).map((one) => [one.id, one.setAside ?? one.status ?? null]))
  await h.keyboard.press('g'); await h.keyboard.press('a')
  check('in Review, G A goes to Writing', (await title()) === 'Writing', await title())
  const cardsAfter = JSON.stringify((await v('items', 'card')).map((one) => [one.id, one.setAside ?? one.status ?? null]))
  const said = await h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role=status]')].map((one) => one.textContent).join(' | '))
  check('…and Review\'s A (set the card aside) does not also run', cardsBefore === cardsAfter && !/aside/i.test(said), `${said}`)

  // 4. No tool up: the app's own keys still work.
  await calm()
  await h.keyboard.press('c'); await wait(700)
  check('with no tool up, C opens quick capture', await capturing(), '')
  await hidePrompt(); await calm()
  await h.keyboard.press('g'); await h.keyboard.press('t')
  check('with no tool up, G T goes to Tasks', /Tasks|Today/.test(await title()), await title())
} catch (error) {
  check('the probe ran to its end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
