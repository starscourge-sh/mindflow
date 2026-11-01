// Settings' sticky material is two choices that differ on sight, Paper and Glass, each drawn over your own desktop
// picture with one line under it saying what it does; picking one sets it, and every sticky stays on screen.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-fi/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/sticky-material.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 860 })
const { h, v, go, close, errors } = s
const shots = process.env.QA_SHOTS
try {
  await go('settings')
  await h.waitForTimeout(800)
  await h.fill('[data-settings-search], input[placeholder*="Search"]', 'sticky note material')
  await h.waitForTimeout(1200)
  const row = h.locator('[data-choices="Sticky note material"]')
  const said = await row.evaluate((one) => ({
    ids: [...one.querySelectorAll('[data-choice]')].map((b) => b.getAttribute('data-choice')),
    lines: [...one.querySelectorAll('[data-choice-said]')].map((b) => b.textContent),
    desk: [...one.querySelectorAll('[data-preview] > span')].map((b) => /url\(/.test(b.style.background))
  }))
  check('two choices, Paper and Glass', said.ids.join() === 'paper,glass', said.ids.join())
  check('each says in one line what it does', said.lines.length === 2 && said.lines.every((one) => one.length > 20), JSON.stringify(said.lines))
  check('each preview sits on the desktop picture when it can be read', said.desk.every(Boolean) || !(await h.evaluate(() => window.api.wallpaper())), JSON.stringify(said.desk))
  for (const theme of ['paper', 'dark']) {
    await h.evaluate((t) => { localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: t })) }, theme)
    await h.waitForTimeout(600)
    if (shots) await row.screenshot({ path: `${shots}/material-${theme}.png` })
  }
  await h.click('[data-choice="paper"]')
  await h.waitForTimeout(500)
  let set = await v('settings')
  check('Paper: solid, no glass', set.stickiesFrosted === false && set.stickiesGlass === false)
  await h.click('[data-choice="glass"]')
  await h.waitForTimeout(500)
  set = await v('settings')
  check('Glass: the window glass', set.stickiesFrosted === true && set.stickiesGlass === true)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
