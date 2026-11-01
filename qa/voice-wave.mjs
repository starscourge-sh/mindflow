// A voice note in a note wears Media's own waveform mark, moving with its sound as it plays, the same one an audio
// file shows (live-bars.tsx), and its name has no file-name tip to cover the row above it.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/voice-wave.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  for (let n = 0; n < 2; n += 1) {
    await page.click('[data-record-button]'); await wait(450); await page.click('[data-shot="record"]')
    await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 })
    await wait(2000)
    await page.keyboard.press('Meta+Enter')
    await wait(1500)
  }
  const cards = await page.$$eval('.tiptap-attachment.is-audio', (all) => all.map((one) => ({ wave: !!one.querySelector('[data-media-wave]'), tip: one.querySelector('.tiptap-attachment-name')?.getAttribute('title') ?? null })))
  check('each voice note wears the waveform mark Media\'s audio does', cards.length === 2 && cards.every((one) => one.wave), JSON.stringify(cards))
  check('no file-name tip on a voice note\'s name', cards.every((one) => one.tip === null), JSON.stringify(cards))
  await page.click('.tiptap-attachment.is-audio .tiptap-media-play')
  let moved = false
  for (let i = 0; i < 12 && !moved; i += 1) {
    await wait(100)
    moved = await page.$eval('.tiptap-attachment.is-audio [data-media-wave]', (svg) => [...svg.querySelectorAll('line')].some((line) => line.getAttribute('transform')))
  }
  check('playing, its bars move with the sound', moved)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(300)
    await page.screenshot({ path: `${shots}/voice-wave-${theme}.png` })
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
