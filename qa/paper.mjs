// Settings › Paper: a note's page is written on plain, ruled, dotted or squared paper, and the
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
  check('Settings shows four papers, each drawn as itself', samples.length === 4 && samples.filter(([, drawn]) => drawn).length === 3 && !samples.find(([id]) => id === 'plain')[1], JSON.stringify(samples))
  if (SHOTS) await h.locator('[data-paper-sample="grid"]').first().evaluate((one) => one.closest('[data-setting]')?.scrollIntoView({ block: 'center' }))
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/paper-settings.png` })
  for (const paper of ['ruled', 'dots', 'grid', 'plain']) {
    await v('settings:set', { paper })
    await go('nuggets')
    await h.locator('[data-row], [data-item-row], li button').first().click().catch(() => {})
    await h.waitForTimeout(700)
    const drawn = await h.evaluate(() => { const box = document.querySelector('.note-pane .haligtree-editor-wrapper:not(.is-line) > .haligtree-editor-content'); if (!box) return null; const drawn = [box, box.querySelector(':scope > .ProseMirror')].map((one) => one && getComputedStyle(one).backgroundImage).find((one) => one && one !== 'none'); return drawn ?? 'none' })
    // Ruled: a rule under each of a paragraph's lines, not across them.
    if (paper === 'ruled') {
      const fit = await h.evaluate(() => { const pm = document.querySelector('.note-pane .haligtree-editor-content > .ProseMirror'); const p = pm?.querySelector('p'); if (!p) return null; const step = parseFloat(getComputedStyle(pm).backgroundSize.split(' ')[1]); return { step: Math.round(step * 10) / 10, line: Math.round(parseFloat(getComputedStyle(p).lineHeight) * 10) / 10 } })
      check('ruled lines are a paragraph line apart', fit && Math.abs(fit.step - fit.line) < 0.5, JSON.stringify(fit))
    }
    check(`a note's page on ${paper} paper`, drawn !== null && (paper === 'plain' ? drawn === 'none' : drawn !== 'none'), String(drawn).slice(0, 60))
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/paper-${paper}.png` })
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
