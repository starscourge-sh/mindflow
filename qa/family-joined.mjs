// The Family tree's relatives have a shape at rest, so its line visibly joins them (the user, 6 Nov: "hard to see that
// these things are connected until the highlight shows up").
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/family-joined.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  const id = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'o' }] }] } }))
  const made = await v('toTask', id)
  await go('upcoming')
  await wait(1000)
  await h.locator('[data-id], [data-task-row]', { hasText: /^\s*o\s*/ }).last().click()
  await wait(1300)
  await h.mouse.move(5, 5)
  await wait(400)
  const node = h.locator('[data-family-node]').first()
  await node.waitFor({ timeout: 6000 })
  const rest = await node.evaluate((one) => {
    const style = getComputedStyle(one)
    const box = one.getBoundingClientRect()
    const path = one.closest('.relative')?.querySelector('svg path')?.getBoundingClientRect()
    return { fill: style.backgroundColor, ring: style.boxShadow, right: box.right, left: box.left, lineFrom: path?.left, lineTo: path?.right }
  })
  check('at rest it has a shape', !/rgba?\(0, 0, 0, 0\)|transparent/.test(rest.fill), rest.fill)
  check('the line meets its edge', rest.lineFrom !== undefined && (Math.abs(rest.lineFrom - rest.right) <= 1.5 || Math.abs(rest.lineTo - rest.left) <= 1.5), JSON.stringify(rest))
  await node.scrollIntoViewIfNeeded()
  await wait(400)
  if (process.env.SHOT) await h.locator('[data-island="Family"], section:has([data-family-label])').first().screenshot({ path: join(process.env.SHOT, 'family-rest.png') }).catch(() => h.screenshot({ path: join(process.env.SHOT, 'family-rest.png') }))
  check('no page errors', !c.errors.some((e) => e.startsWith('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('the run finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
