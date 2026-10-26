// Read, writing (⌘L): Vim as everywhere else when it is on. Escape goes first to Vim (insert to normal), then
// from normal stops writing; reading, the keys stay Read's.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/read-vim.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const mode = () => h.evaluate(() => document.querySelector('[role="dialog"][aria-label="Reading"] [data-vim-mode]')?.getAttribute('data-vim-mode') ?? null)
const reading = () => h.locator('[role="dialog"][aria-label="Reading"]').count()
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => { localStorage.setItem('vim', 'on'); window.dispatchEvent(new StorageEvent('storage', { key: 'vim', newValue: 'on' })) })
  await c.go('inbox'); await wait(1500)
  await h.click('[data-capture-row], [data-row]').catch(() => {})
  await wait(800)
  await h.click('[data-note-head] button[aria-label="Read"]')
  await wait(900)
  check('Read opens', (await reading()) === 1)
  check('reading: no Vim, the keys are Read\'s', (await mode()) === null, String(await mode()))
  await h.keyboard.press('Meta+l'); await wait(700)
  check('writing (⌘L): Vim, in normal mode', /normal/i.test((await mode()) ?? ''), String(await mode()))
  await h.keyboard.press('i'); await wait(200)
  check('i: insert', /insert/i.test((await mode()) ?? ''), String(await mode()))
  await h.keyboard.press('Escape'); await wait(300)
  check('Escape goes to Vim first: back to normal, still writing', /normal/i.test((await mode()) ?? '') && (await reading()) === 1, String(await mode()))
  await h.keyboard.press('Escape'); await wait(500)
  check('Escape from normal stops writing, Read stays open', (await mode()) === null && (await reading()) === 1, String(await mode()))
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
