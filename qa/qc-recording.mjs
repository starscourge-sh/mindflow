// Quick capture while a voice note records: the recorder takes the writing
// line's place (not floating over it), its level moves as sound comes in,
// Create reads "Stop and keep" and keeps the recording in the box, the other
// buttons in the row dim, ⌘↵ keeps it too, and Esc throws it away.
// Chromium's stand-in microphone, for this probe only.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/qc-recording.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = `${process.env.QA_ARGS ?? '--sandbox'} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
}
const audios = () => page.evaluate((sel) => document.querySelectorAll(`${sel} .tiptap-attachment.is-audio`).length, EDITOR)
// The level's drawing as a row of bar heights: the tallest inked run in each column.
const levelShape = () => page.evaluate(() => {
  const canvas = document.querySelector('[data-voice-level]')
  if (!canvas) return null
  const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const cols = []
  for (let x = 0; x < width; x += 1) {
    let n = 0
    for (let y = 0; y < height; y += 1) if (data[(y * width + x) * 4 + 3] > 0) n++
    cols.push(n)
  }
  return { tallest: Math.max(...cols), sum: cols.reduce((a, b) => a + b, 0), height }
})
// Light or dark in the box itself, in place, so what is open stays open.
const look = (name) => page.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, name)
// The box focused before a picture: unfocused, the window wears its dimming veil and every shot reads grey.
const focusBox = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view=home') && w.isVisible())?.focus())
const record = async () => {
  await page.click('[data-record-button]')
  await page.waitForSelector('[data-voice-recorder]', { timeout: 6000 }).catch(() => {})
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await reopen()
  // A leftover, so the chip's place beside the recorder is seen too.
  await page.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'what is this thing I wrote down this morning about the Venetian patent statute and the guilds' }] }] }))
    localStorage.setItem('capture-draft-at', String(Date.now() - 3 * 3600_000))
  })
  await reopen()
  for (const name of ['light', 'dark']) { await look(name); await focusBox(); await wait(400); await page.screenshot({ path: `${shots}/qc-recording-idle-${name}.png` }) }
  await look('light')

  // The side panel shut, as in the user's box: with it open the box keeps the panel's full height.
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(900) }
  await page.evaluate(() => {
    window.__heights = []
    const until = performance.now() + 1800
    const step = () => { window.__heights.push(innerHeight); if (performance.now() < until) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  })
  await record()
  check('the recorder opens', !!(await page.$('[data-voice-recorder]')))
  await wait(1200)
  const a = await levelShape(); await wait(700); const b = await levelShape()
  check('the level moves while sound comes in', a && b && Math.max(a.tallest, b.tallest) > 8 && a.sum !== b.sum, JSON.stringify({ a, b }))

  const layout = await page.evaluate((sel) => {
    const rec = document.querySelector('[data-voice-recorder]')
    const r = rec.getBoundingClientRect()
    const editor = document.querySelector(sel)
    const e = editor?.getBoundingClientRect()
    const chip = document.querySelector('[data-leftover]')?.getBoundingClientRect()
    const overlaps = (x, y) => x && y && x.width && y.width && x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom
    return {
      inSlot: !!rec.closest('[data-recorder-slot]'),
      floating: getComputedStyle(rec).position === 'fixed',
      overEditor: !!(e && e.height && overlaps(r, e)),
      overChip: !!overlaps(r, chip),
      chipBelow: chip ? chip.top >= r.bottom - 1 : null
    }
  }, EDITOR)
  check('the recorder sits in the writing area, not over it', layout.inSlot && !layout.floating && !layout.overEditor && !layout.overChip, JSON.stringify(layout))
  check('…and the "Still to keep" chip sits under it, on the text column', layout.chipBelow === true, JSON.stringify(layout))
  // The box fits the recording: no empty room between the chip and the footer.
  await wait(900)
  const fit = await page.evaluate(() => {
    const last = (document.querySelector('[data-leftover]') ?? document.querySelector('[data-voice-recorder]')).getBoundingClientRect().bottom
    const foot = document.querySelector('[data-create]').getBoundingClientRect().top
    const POPS = "[role=dialog]:not([data-keeps-size]), [role=alertdialog], [role=menu]:not([data-keeps-size]), [role=listbox]:not([data-keeps-size] *), [data-radix-popper-content-wrapper]:not(:has([role=tooltip])):not(:has([data-keeps-size])), .tiptap-suggestion-popup, [data-celebration]:not(:empty)"
    const pop = document.querySelector(POPS)
    return { gap: Math.round(foot - last), height: innerHeight, pop: pop ? pop.outerHTML.slice(0, 120) : null }
  })
  check('the box fits the recording, with no dead space above the footer', fit.gap < 90, JSON.stringify(fit))
  const row = await page.evaluate(() => ({
    create: document.querySelector('[data-create]')?.textContent.replace(/\s+/g, ' ').trim(),
    dimmed: [...document.querySelectorAll('[data-record-button], [data-kind-chip], [aria-label="Take a screenshot"], [aria-label="Create more"]')].map((el) => {
      let o = 1
      for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
      return { o: Math.round(o * 100) / 100, inert: !!el.closest('[inert]') }
    })
  }))
  check('Create reads "Stop and keep ⌘↵"', (row.create ?? '').replace(/\s+/g, '').startsWith('SSttooppaannddkkeeeepp') || /^Stop and keep ⌘↵$/.test(row.create ?? ''), String(row.create))
  check('the kind, camera, mic and Create more are dimmed and out of reach', row.dimmed.length === 4 && row.dimmed.every((one) => one.o < 0.5 && one.inert), JSON.stringify(row.dimmed))
  // Tab walks past them: from Cancel, never onto a dimmed one.
  await page.focus('[data-voice-recorder] button[aria-label="Cancel"]')
  const tabbed = []
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    tabbed.push(await page.evaluate(() => !!document.activeElement?.closest('[data-while-recording]')))
  }
  check('Tab skips the dimmed buttons', tabbed.every((on) => !on), JSON.stringify(tabbed))
  for (const name of ['light', 'dark']) { await look(name); await focusBox(); await wait(400); await page.screenshot({ path: `${shots}/qc-recording-live-${name}.png` }) }
  // The shrink glides one way: every frame as tall as the last or shorter, never a bounce.
  const heights = await page.evaluate(() => window.__heights)
  const bounces = heights.filter((h, i) => i && h > heights[i - 1]).length
  check('starting to record never grows the box, and it never bounces', heights.every((h) => h <= heights[0]) && bounces === 0, `${heights[0]} -> ${Math.max(...heights)} max -> ${heights.at(-1)} over ${heights.length} frames, ${bounces} steps up`)
  // The long leftover stays one line in the row, cut with an ellipsis, inside the window.
  const chip = await page.evaluate(() => { const r = document.querySelector('[data-leftover]').getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, h: Math.round(r.height), text: document.querySelector('[data-leftover]').innerText } })
  check('a long leftover stays one line, inside the window', chip.right <= chip.width - 12 && chip.h < 30, JSON.stringify(chip))
  // Two hours in: the time reads 2:00:0x, not "120:0x".
  await page.evaluate(() => { const real = performance.now.bind(performance); performance.now = () => real() + 7_200_000 })
  await wait(1200)
  const late = await page.evaluate(() => document.querySelector('[data-voice-time]')?.textContent)
  check('two hours in, the time reads 2:00:0x', /^2:00:0\d$/.test(late ?? ''), String(late))
  for (const name of ['light', 'dark']) { await look(name); await focusBox(); await wait(400); await page.screenshot({ path: `${shots}/qc-recording-2h-${name}.png` }) }
  await look('light')
  await look('light')

  await page.keyboard.press('Escape'); await wait(800)
  const afterEsc = { recorder: !!(await page.$('[data-voice-recorder]')), audio: await audios(), open: await page.evaluate(() => document.visibilityState) }
  check('Esc cancels: the recorder goes, nothing kept, the box stays open', !afterEsc.recorder && afterEsc.audio === 0 && afterEsc.open === 'visible', JSON.stringify(afterEsc))

  await record(); await wait(1500)
  await page.click('[data-create]')
  await page.waitForSelector(`${EDITOR} .tiptap-attachment.is-audio`, { timeout: 8000 }).catch(() => {})
  await wait(600)
  const kept = { recorder: !!(await page.$('[data-voice-recorder]')), audio: await audios(), create: await page.evaluate(() => document.querySelector('[data-create]')?.textContent.replace(/\s+/g, ' ').trim()) }
  check('Stop and keep keeps the recording in the box, and Create comes back', !kept.recorder && kept.audio === 1 && /^Create/.test(kept.create ?? '') || /^CCrreeaattee/.test(kept.create ?? ''), JSON.stringify(kept))
  await page.screenshot({ path: `${shots}/qc-recording-kept-light.png` })

  await record(); await wait(1200)
  const before = await page.evaluate(() => ({ rec: !!document.querySelector('[data-voice-recorder]'), focus: document.activeElement?.outerHTML.slice(0, 80) }))
  await page.keyboard.press('Meta+Enter')
  await page.waitForFunction((sel) => document.querySelectorAll(`${sel} .tiptap-attachment.is-audio`).length === 2, EDITOR, { timeout: 8000 }).catch(() => {})
  check('⌘↵ while recording stops and keeps it too (not a save without it)', (await audios()) === 2 && !(await page.$('[data-voice-recorder]')), `${await audios()} ${JSON.stringify(before)}`)
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
