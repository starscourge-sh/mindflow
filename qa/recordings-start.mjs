// What Settings says about “Hide from recordings” is what a new book does. A new book shows every window in screen
// shares and recordings (main/haligtree.ts: `inRecordings`, all true, "so a screenshot taken during the welcome has
// Haligtree in it"), its four switches all off, and the words beside them say so. They said "All are hidden to
// start; turn one off for a demo" while every one showed. Off screen, in a new book of its own (never the example book).
//   QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/recordings-start.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'

// A new book, whatever the run was given: the example book wears the settings it was set out with.
process.env.QA_DATA = mkdtempSync(join(tmpdir(), 'haligtree-recordings-'))
delete process.env.QA_ARGS
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 820, seeded: false })
const { h, v } = c
try {
  // Welcomed already: the welcome would lie over everything.
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload(); await h.waitForTimeout(1500)
  const start = (await v('settings')).inRecordings
  const shown = ['main', 'box', 'stickies', 'bubble'].every((kind) => start?.[kind] === true)
  check('a new book starts with every window shown in recordings', shown, JSON.stringify(start))
  await c.go('settings')
  await h.getByText('What comes back to you', { exact: true }).first().click()
  await h.waitForTimeout(700)
  const head = h.locator('[data-setting-title="Hide from recordings"]')
  await head.scrollIntoViewIfNeeded()
  const on = await h.locator('[data-recording][aria-checked="true"], [data-recording][data-checked]').count()
  check('its four switches are all off: none hidden', (await h.locator('[data-recording]').count()) === 4 && on === 0, `${on} on`)
  // The words under the small "more" mark beside the title, shown on a rest there.
  await head.locator('[data-setting-more]').hover()
  await h.waitForSelector('[data-slot="tooltip-content"], [role="tooltip"]', { timeout: 5000 }).catch(() => {})
  const said = await h.evaluate(() => [...new Set([...document.querySelectorAll('[data-slot="tooltip-content"], [role="tooltip"]')].map((one) => one.textContent.trim()))].join(' | '))
  check('Settings says how they start, as they do: all shown, none hidden', shown && /All show to start/.test(said) && !/hidden to start/.test(said), said)
  check('and what a switch is for: turned on before a share', /turn one on before you share your screen/.test(said), said)
  if (process.env.QA_SHOTS) for (const look of ['light', 'dark']) { await c.look(look); await head.locator('[data-setting-more]').hover(); await h.waitForTimeout(900); await h.screenshot({ path: `${process.env.QA_SHOTS}/recordings-start-${look}.png` }) }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
