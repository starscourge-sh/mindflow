// Every row in the sidebar shows the hand: places, folders, pins, Recent and the headings that fold them.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sidebar-hand.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h } = c
try {
  await h.waitForTimeout(2000)
  const arrows = await h.evaluate(() => [...document.querySelectorAll('aside[data-chrome] button:not(:disabled)')].filter((one) => one.getBoundingClientRect().width > 0).flatMap((one) => [one, ...one.querySelectorAll('span, svg')]).filter((one) => getComputedStyle(one).cursor !== 'pointer').map((one) => (one.closest('button')?.textContent ?? '').trim().slice(0, 30)))
  check('every sidebar row and heading shows the hand', arrows.length === 0, JSON.stringify([...new Set(arrows)].slice(0, 8)))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
