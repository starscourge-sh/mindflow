// Settings › Paper: a page is written on plain, dotted or squared paper, and the
// choice shows itself in Settings as a swatch of each.
//   npx electron-vite build --outDir out-pp
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-pp/main/index.js HALIGTREE_QA_AWAY=1 node qa/paper.mjs [shots]
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOTS = process.argv[2] ?? ''
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v } = c
try {
  await v('settings:set', { sounds: false })
  await go('settings')
  // Found as anyone would: typed into Settings' own search.
  await h.locator('input[type="search"], input[placeholder*="Search" i]').first().fill('paper')
  await h.waitForSelector('[data-paper-sample]', { timeout: 8000 })
  const samples = await h.evaluate(() => [...document.querySelectorAll('[data-paper-sample]')].map((one) => [one.dataset.paperSample, getComputedStyle(one).backgroundImage !== 'none']))
  check('Settings shows three papers (plain, dots, grid), each drawn as itself', samples.length === 3 && samples.filter(([, drawn]) => drawn).length === 2 && !samples.find(([id]) => id === 'plain')[1], JSON.stringify(samples))
  if (SHOTS) await h.locator('[data-paper-sample="grid"]').first().evaluate((one) => one.closest('[data-setting]')?.scrollIntoView({ block: 'center' }))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/paper-settings.png` })
  for (const paper of ['dots', 'grid', 'plain']) {
    await v('settings:set', { paper })
    await go('nuggets')
    await h.locator('[data-row], [data-item-row], li button').first().click().catch(() => {})
    await h.waitForTimeout(700)
    const drawn = await h.evaluate(() => { const box = document.querySelector('.note-pane .haligtree-editor-wrapper:not(.is-line) > .haligtree-editor-content'); if (!box) return null; const drawn = [box, box.querySelector(':scope > .ProseMirror')].map((one) => one && getComputedStyle(one).backgroundImage).find((one) => one && one !== 'none'); return drawn ?? 'none' })
    check(`a note's page on ${paper} paper`, drawn !== null && (paper === 'plain' ? drawn === 'none' : drawn !== 'none'), String(drawn).slice(0, 60))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/paper-${paper}.png` })
  }
  // The Journal's day page and the writing room wear it too.
  await v('settings:set', { paper: 'grid' })
  await go('day')
  await h.waitForSelector('[data-day-write] .ProseMirror', { timeout: 10000 })
  const onDay = await h.evaluate(() => getComputedStyle(document.querySelector('[data-day-write] .haligtree-editor-wrapper:not(.is-line) > .haligtree-editor-content')).backgroundImage)
  check('the Journal\'s day page is on the same paper', onDay !== 'none', onDay.slice(0, 40))
  await h.click('[data-room-open]')
  await h.waitForSelector('[data-room]', { timeout: 5000 })
  const inRoom = await h.evaluate(() => getComputedStyle(document.querySelector('[data-room] .haligtree-editor-wrapper:not(.is-line) > .haligtree-editor-content')).backgroundImage)
  check('and so is the writing room', inRoom !== 'none', inRoom.slice(0, 40))
  if (SHOTS) (await h.waitForTimeout(700), await h.screenshot({ path: `${SHOTS}/paper-room.png` }))
  await h.keyboard.press('Escape')
  await v('settings:set', { paper: 'plain' })
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
