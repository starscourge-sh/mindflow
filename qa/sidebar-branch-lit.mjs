// The sidebar's Pinned and Recent light their line to the note that is open, as a folder's and a tag's do.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/sidebar-branch-lit.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// The lit twig: a path drawn whole (pathLength 1) in the group whose rows hold `sel`.
const lit = (sel) => h.evaluate((sel) => {
  const row = document.querySelector(sel)
  let box = row; while (box && !box.parentElement?.querySelector(':scope > svg')) box = box.parentElement
  const svg = box?.parentElement?.querySelector(':scope > svg')
  return svg ? [...svg.querySelectorAll('path')].some((one) => Number(getComputedStyle(one).strokeDashoffset) === 0 && one.getAttribute('pathLength') && getComputedStyle(one).opacity !== '0') : null
}, sel)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.locator('aside [data-side-row]').filter({ hasText: 'Start here' }).first().click(); await wait(1500)
  // The twig to the open pin, drawn whole: its path's dash offset at nothing.
  const twig = await h.evaluate(() => {
    const row = [...document.querySelectorAll('aside [data-side-row]')].find((one) => one.textContent.includes('Start here'))
    let at = row; while (at && !at.querySelector(':scope > svg')) at = at.parentElement
    return [...(at?.querySelector(':scope > svg')?.querySelectorAll('path[stroke="var(--primary)"]') ?? [])].map((one) => one.getAttribute('stroke-dasharray') ?? '')
  })
  check('Pinned lights its line to the open note', twig.some((one) => parseFloat(one) > 0.9), JSON.stringify(twig))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/branch-lit.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
