// Recording in quick capture with its side panel open: the panel stays where it is (nothing glides away), the
// recorder bar takes the footer's row of the writing side, and the level fits inside the bar, in the faded ink.
// Pictures light and dark into QA_SHOTS. Chromium's stand-in microphone.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/qc-recording-compact.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const boxWidth = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && w.isVisible())?.getBounds().width ?? 0)
const look = (name) => page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
const focusBox = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=') && w.isVisible())?.focus())
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1500)
  if (await page.$('[aria-label="Show the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  const open = await boxWidth()
  await page.click('[data-record-button]'); await page.waitForTimeout(450); await page.click('[data-shot="record"]')
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 })
  await wait(1500)
  const recording = await boxWidth()
  check('recording with the side panel open: the panel stays, the box keeps its size', Math.abs(recording - open) < 4, `${open} -> ${recording}`)
  const level = await page.$eval('[data-voice-level]', (one) => { const r = one.getBoundingClientRect(); const bar = one.closest('[data-voice-recorder]').getBoundingClientRect(); const row = document.querySelector('main[data-chrome]').getBoundingClientRect(); return { inBar: r.left >= bar.left && r.right <= bar.right && r.top >= bar.top && r.bottom <= bar.bottom, inRow: bar.left >= row.left && bar.right <= row.right, height: r.height, color: getComputedStyle(one).color } })
  check('the level sits inside the bar, the bar inside the writing side\'s footer row', level.inBar && level.inRow && level.height <= 32, JSON.stringify(level))
  // The red "on air" light round the edge goes round the card, not the clear room round it (a frame far out on the screen).
  const edge = await page.evaluate(() => {
    const beam = document.querySelector('[data-beam="recording"]')?.getBoundingClientRect()
    const card = document.querySelector('.app-container').getBoundingClientRect()
    return beam ? Math.max(Math.abs(beam.left - card.left), Math.abs(beam.top - card.top), Math.abs(beam.width - card.width), Math.abs(beam.height - card.height)) : -1
  })
  check('the recording light goes round the card\'s edge, not the window\'s', edge >= 0 && edge < 1, String(edge))
  for (const name of ['light', 'dark']) { await look(name); await focusBox(); await wait(500); await page.screenshot({ path: `${shots}/qc-recording-compact-${name}.png` }) }
  await look('light')
  await page.keyboard.press('Meta+Enter')
  await wait(2000)
  const after = await boxWidth()
  check('kept: the panel comes back as it was', Math.abs(after - open) < 4, `${open} -> ${after}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
