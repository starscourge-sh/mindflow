// No grey window dots on the card. Quick capture's round controls above the card ("2 pinned", the pencil, the gear, the panel): never overlapping,
// one even gap, at every text size (Settings' "Text size" sets the page's root size, 13px to 20px), with a long
// pinned count, at a narrow and a wide card, light and dark. Pictures into QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/qc-round-controls.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  for (let n = 0; n < 12; n += 1) {
    const id = await c.h.evaluate((body) => window.api.captures.create({ body }), `Pinned ${n}`)
    await v('pin', 'captures', id?.id ?? id, true)
  }
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  for (const [size, panel] of [[13, false], [16, false], [20, false], [16, true]]) {
    if (panel && !(await page.$('[aria-label="Hide the side panel"]'))) { await page.keyboard.press('Meta+Backslash'); await wait(1200) }
    // The pointer in the card, as when the user reaches for them.
    const card = await page.$eval('.app-container', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.move(card.x, card.y)
    // The page reads the pointer from main while another app is in front: said here as it would be.
    await page.evaluate(() => document.querySelector('.app-container').classList.add('pointer-in'))
    await wait(700)
    if (process.env.QA_DEBUG) console.log(await page.$eval('.mf-top [data-aside]', (el) => { const s = getComputedStyle(el); return JSON.stringify({ t: s.transform, tr: s.translate, top: getComputedStyle(el.parentElement).transform, cls: document.querySelector('.app-container').className }) }))
    for (const look of ['light', 'dark']) {
      await page.evaluate(([px, n]) => {
        document.documentElement.style.fontSize = `${px}px`
        localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
      }, [size, look])
      await wait(400)
      const orbs = await page.$$eval('.mf-top [data-aside] > *, .mf-top .mf-pill button', (all) => all.filter((one) => one.getBoundingClientRect().width > 0).map((one) => {
        const r = one.getBoundingClientRect()
        return { label: (one.getAttribute('aria-label') ?? one.textContent.trim()).slice(0, 12), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }
      }))
      const dots = await page.$eval('.mf-dots', (el) => getComputedStyle(el).display !== 'none' && Number(getComputedStyle(el).opacity) > 0).catch(() => false)
      check(`text ${size}px, ${look}: no three grey dots on the card, pointer in`, !dots)
      const gaps = orbs.slice(1).map((one, i) => one.left - orbs[i].right)
      check(`text ${size}px, ${look}: the controls never overlap and sit one even gap apart`, orbs.length >= 4 && gaps.every((gap) => gap === 8), `${JSON.stringify(gaps)} ${JSON.stringify(orbs)}`)
      await page.screenshot({ path: `${shots}/qc-round-${size}-${look}.png`, clip: { x: 0, y: 0, width: (await page.evaluate(() => innerWidth)), height: 140 } })
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
