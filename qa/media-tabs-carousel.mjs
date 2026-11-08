// Media shows a tab only for a kind the book holds (the user, 6 Nov: "why show tabs for items that dont exist yet?").
// (The picture carousel it also checked is gone: Files keeps pictures by month, qa/files-piles.mjs.)
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/media-tabs-carousel.mjs [shots]
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1100, height: 760 })
const { h, go } = c
try {
  await go('media')
  await h.waitForTimeout(2500)
  const tabs = await h.$$eval('[data-media-kinds] button', (all) => all.map((one) => one.textContent.trim()))
  // The sandbox holds only pictures here: one kind needs no tabs at all.
  check('no tab for a kind the book has none of', !tabs.includes('Audio') && !tabs.includes('GIFs') && !tabs.includes('Books') && !tabs.includes('PDFs'), tabs.join(', ') || 'no tabs')
  if (SHOTS) await h.screenshot({ path: join(SHOTS, 'media.png') })
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
