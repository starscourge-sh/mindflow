// Highlights, "Soft" or "Rich": a choice in Settings, each option shown in its own colours whatever the window
// wears; picking "Rich" deepens every highlight at once (they are colour variables), in light and in dark.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/highlights.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOTS
const weight = () => h.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-highlight-weight').trim())
const light = () => h.evaluate(() => document.documentElement.hasAttribute('data-light'))
const samples = () => h.evaluate(() => [...document.querySelectorAll('[data-hl-sample] mark')].map((one) => getComputedStyle(one).backgroundColor))
try {
  await v('settings:set', { sounds: false, hintRate: 0, highlights: 'soft' })
  await wait(600)
  check('soft by default: the theme\'s colours at their light weight', (await weight()) === ((await light()) ? '28%' : '42%'), await weight())
  await c.go('settings')
  await h.click('[data-section="Appearance"]').catch(() => {})
  await wait(800)
  const row = h.locator('[data-hl-sample]').first()
  await row.scrollIntoViewIfNeeded()
  await wait(400)
  const both = await samples()
  check('each option shows its own colours', both.length === 8 && both[0] !== both[4], JSON.stringify(both))
  for (const theme of ['light', 'dark']) {
    if (!shots) break
    if (theme === 'dark') { await c.theme('dark'); await c.go('settings'); await h.click('[data-section="Appearance"]').catch(() => {}); await wait(800); await row.scrollIntoViewIfNeeded(); await wait(300) }
    const box = await row.evaluate((one) => { const r = one.getBoundingClientRect(); return { x: Math.max(0, r.x - 420), y: Math.max(0, r.y - 120), width: 760, height: 220 } })
    await h.screenshot({ path: `${shots}/highlights-${theme}.png`, clip: box })
  }
  const before = await samples()
  await h.getByRole('radio', { name: 'Rich' }).first().click().catch(async () => h.getByText('Rich', { exact: true }).first().click())
  await wait(800)
  check('"Rich" picked: every highlight deepens at once', ['58%', '70%'].includes(await weight()) && (await v('settings')).highlights === 'rich', await weight())
  check('and the samples stay as they were, each its own', JSON.stringify(await samples()) === JSON.stringify(before), JSON.stringify(await samples()))
  check('a highlighted word in a note now wears the "Rich" sample\'s colour', await h.evaluate(() => { const one = document.createElement('mark'); one.style.background = 'var(--tt-color-highlight-yellow)'; document.body.append(one); const said = getComputedStyle(one).backgroundColor; one.remove(); return said }) === before[4], 'not the rich sample')
  check('no page errors', !c.errors?.some((one) => /PAGEERROR/.test(one)), (c.errors ?? []).slice(0, 2).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await v('settings:set', { highlights: 'soft' }).catch(() => {})
  await c.close?.()
}
done()
