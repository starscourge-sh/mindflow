// The window's bar has no "Fill the screen" (the green button does that, ⌃⇧F too); in its place each open note's
// head has "Expanded view", which opens that note alone in one quiet scroll, and Esc closes it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/expand-button.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1440, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await c.go('inbox'); await wait(1500)
  await h.click('[data-capture-row], [data-row]').catch(() => {})
  await wait(900)
  check('no "Fill the screen" in the window\'s bar', (await h.locator('button[aria-label="Fill the screen"]').count()) === 0)
  check('the open note\'s head has "Expanded view"', (await h.locator('[data-expand-note]').count()) === 1)
  await h.click('[data-expand-note]')
  await wait(800)
  check('it opens the note alone, expanded', (await h.locator('[data-expanded-note]').count()) === 1)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/expanded.png` })
  await h.keyboard.press('Escape'); await wait(600)
  check('Esc closes it', (await h.locator('[data-expanded-note]').count()) === 0)
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
