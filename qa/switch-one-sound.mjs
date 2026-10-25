// A switch sounds once: its own "on" or "off", nothing after it. The Inbox's
// "Show sorted too" once played "on" twice, which reads as a second, other sound.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/switch-one-sound.mjs
// It reads what played (window.haligtreeHeard), so it runs muted like every probe.
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const since = async (run) => {
  const from = await h.evaluate(() => (window.haligtreeHeard ?? []).length)
  await run(); await wait(1600)
  return (await h.evaluate((n) => (window.haligtreeHeard ?? []).slice(n), from)).filter((one) => !String(one).startsWith('click:'))
}
try {
  await go('inbox'); await wait(1500)
  const sorted = h.getByRole('switch', { name: 'Show sorted too' })
  for (const [turn, sound] of [['on', 'on'], ['off', 'off']]) {
    const heard = await since(() => sorted.click())
    check(`Show sorted too, ${turn}: one "${sound}" and nothing else`, heard.length === 1 && heard[0] === `cue:${sound}`, heard.join(', '))
  }
  // Settings' own switches, each turned and turned back: one sound for each turn.
  await go('settings'); await wait(1500)
  const switches = h.locator('[data-slot="switch"]:not([data-disabled])')
  const count = Math.min(await switches.count(), 12)
  for (let i = 0; i < count; i++) {
    const one = switches.nth(i)
    if (!(await one.isVisible().catch(() => false))) continue
    const name = (await one.getAttribute('aria-label')) ?? `switch ${i + 1}`
    const heard = await since(() => one.click())
    check(`Settings, ${name}: one sound`, heard.length === 1, heard.join(', '))
    await since(() => one.click())
    // A switch whose preview plays on (Count in a session counts 5 down aloud): quiet again before the next.
    for (let quiet = 0; quiet < 8 && (await since(async () => {})).length; quiet++);
  }
  // Customize sidebar shows its own way out, and that closes it.
  await go('inbox'); await wait(1000)
  await h.locator('aside button[aria-label$=" menu"]').last().click(); await wait(400)
  await h.locator('[data-peek="customize"]').click()
  await wait(600)
  const close = h.locator('[data-customize-close]')
  check('Customize sidebar has a Close button in sight', await close.isVisible().catch(() => false))
  await close.click().catch(() => {}); await wait(600)
  check('Close shuts Customize sidebar', !(await h.locator('[data-show-every], [data-show-row]').first().isVisible().catch(() => false)))
} finally {
  await c.close()
}
done()
