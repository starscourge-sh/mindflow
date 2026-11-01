// Quick capture's microphone works like the camera: a click shows two round choices above it, "Record" and "Dictate",
// in the camera's arc, look and keys (Esc closes, the arrows move, Return picks). Record starts a voice note; picked
// while dictating, dictation stops first, and dictating stops a recording first: never both. Pictures into QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mic-pair.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const MIC = '[data-record-button]'
const pair = () => page.evaluate(() => {
  const mic = document.querySelector('[data-record-button]').getBoundingClientRect()
  return ['record', 'dictate'].map((id) => {
    const one = document.querySelector(`[data-shot="${id}"]`)
    const r = one.getBoundingClientRect()
    return { id, label: one.getAttribute('aria-label'), opacity: getComputedStyle(one).opacity, above: r.bottom <= mic.top + 1, w: one.offsetWidth }
  })
})
const camera = () => page.evaluate(() => [...document.querySelectorAll('[data-shot="screen"], [data-shot="area"]')].map((one) => one.offsetWidth))
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  await page.click(MIC)
  await wait(500)
  const open = await pair()
  check('a click on the mic shows "Record" and "Dictate", both above it', open.every((one) => one.opacity === '1' && one.above) && /^Record/.test(open[0].label) && /^Dictate/.test(open[1].label), JSON.stringify(open))
  check('they are the camera\'s round choices, the same size', (await camera()).every((w) => w === open[0].w), JSON.stringify([await camera(), open.map((one) => one.w)]))
  for (const theme of ['light', 'dark']) {
    await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(300)
    const at = await page.$eval(MIC, (one) => { const r = one.getBoundingClientRect(); return { x: r.x, y: r.y } })
    await page.screenshot({ path: `${shots}/mic-pair-${theme}.png`, clip: { x: Math.max(0, at.x - 140), y: Math.max(0, at.y - 90), width: 320, height: 140 } })
  }
  await page.keyboard.press('Escape')
  await wait(400)
  check('Esc closes them', (await pair()).every((one) => one.opacity === '0'))
  await page.click(MIC)
  await wait(450)
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
  check('the arrows and Return pick "Record": a voice note records', !!(await page.$('[data-voice-recorder]')))
  await page.keyboard.press('Escape')
  await wait(800)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
