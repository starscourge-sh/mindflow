// The sandbox wears lightsaber bars, whatever your own are; the first rest
// on one there offers the setting, once; your own book stays plain.
//
//   npx electron-vite build --outDir out-sb
//   D=$(mktemp -d); QA_DATA=$D QA_ARGS=--sandbox QA_ENTRY=out-sb/main/index.js SHOT=<dir> node qa/sabers-sandbox.mjs
//   QA_DATA=$D QA_ENTRY=out-sb/main/index.js SHOT=<dir> OWN=1 node qa/sabers-sandbox.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOT = process.env.SHOT ?? 'scratchpad/sabers'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const OWN = !!process.env.OWN

const c = await sandbox({ width: 1200, height: 900, seeded: !OWN })
const { h, v } = c
const text = () => h.evaluate(() => document.body.innerText)
const rest = async () => {
  const bar = h.locator('[data-style="saber"]').first()
  await h.mouse.move(5, 5)
  await h.waitForTimeout(300)
  await bar.scrollIntoViewIfNeeded()
  await bar.hover()
  await h.waitForTimeout(1200)
}
try {
  if (!OWN) {
    await h.waitForTimeout(2500)
    check('sandbox setting is saber', (await v('settings')).progressBars === 'saber')
    check('sandbox bars drawn as sabers', (await h.evaluate(() => document.documentElement.dataset.bars)) === 'saber')
    let body = ''
    for (let i = 0; i < 75 && !body.includes('You’re in the sandbox'); i++) (body = await text()), await h.waitForTimeout(200)
    check('arrival line says a peek into someone else\'s book', body.includes('a peek into someone else’s book'), body.match(/You’re in the sandbox[^\n]*/)?.[0])
    await h.screenshot({ path: `${SHOT}/arrival.png` })
    await c.go('home')
    await h.waitForTimeout(800)
    const sabers = await h.locator('[data-style="saber"]').count()
    check('Home shows saber bars', sabers > 0, `${sabers}`)
    await rest()
    const heard = await h.evaluate(() => window.haligtreeHeard ?? [])
    check('resting on a blade hums it', heard.includes('saber-touch'), heard.slice(-4).join(' '))
    const hint = await text()
    check('the hint shows', hint.includes('Like these? Your own bars can be lightsabers too'))
    await h.screenshot({ path: `${SHOT}/hint.png` })
    await h.getByRole('button', { name: /Show me/ }).first().click()
    await h.waitForTimeout(2500)
    const pointed = await h.evaluate(() => document.querySelector('[data-pointed]')?.textContent ?? '')
    check('Show me points at Progress bars in Settings', pointed.includes('Progress bars'), pointed.slice(0, 60))
    await h.screenshot({ path: `${SHOT}/show-me.png` })
    await h.evaluate(() => localStorage.setItem('settings:section', 'Help'))
    await c.go('home')
    await c.go('settings')
    await h.waitForTimeout(800)
    check('Settings note reframed', (await text()).includes("a peek into someone else's book"))
    await h.screenshot({ path: `${SHOT}/settings-help.png` })
    await h.keyboard.press('Escape')
    await c.go('home')
    await h.waitForTimeout(800)
    await h.mouse.move(5, 5)
    await h.waitForTimeout(4500)
    await rest()
    check('the hint shows only once', !(await text()).includes('Like these?'))
  } else {
    check('own book setting stays plain', (await v('settings')).progressBars === 'plain', (await v('settings')).progressBars)
    check('own book bars plain', (await h.evaluate(() => document.documentElement.dataset.bars)) === 'plain')
    // Chosen at home: the blade hums but nothing advertises it.
    await v('settings:set', { progressBars: 'saber' })
    await c.go('home')
    await h.waitForTimeout(1200)
    const n = await h.locator('[data-style="saber"]').count()
    if (n) {
      await rest()
      check('own book: no hint', !(await text()).includes('Like these?'))
    } else check('own book: no saber bar to rest on (no goals), skipped', true)
    await v('settings:set', { progressBars: 'plain' })
  }
} catch (error) {
  check('ran', false, String(error).slice(0, 300))
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
  await c.close()
}
console.log(`${results.filter(Boolean).length}/${results.length}`)
process.exit(results.every(Boolean) ? 0 : 1)
