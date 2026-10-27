// Settings split beside Tasks scrolls to its very end and stays there: the outline's lit mark is kept in sight in
// its own list only, never by moving the page (it pulled the page back up, short of "With each capture").
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/settings-scroll.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h } = c
try {
  await h.evaluate(() => window.api.haligtree('settings:set', { motion: true, sounds: false }))
  await h.evaluate(() => localStorage.setItem('settings:section', 'Writing'))
  await c.go('today'); await h.waitForTimeout(1200)
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:aside', { detail: { type: 'view', id: 'settings' } }))); await h.waitForTimeout(1800)
  await h.click('[data-section="Writing"]').catch(() => {}); await h.waitForTimeout(800)
  const box = await h.evaluate(() => { const one = [...document.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(n).overflowY) && n.textContent.includes('With each capture')).pop(); one.setAttribute('data-qa-scroll', ''); const r = one.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await h.mouse.move(box.x, box.y)
  for (let i = 0; i < 30; i++) { await h.mouse.wheel(0, 300); await h.waitForTimeout(30) }
  const at = []
  for (let i = 0; i < 10; i++) { at.push(await h.evaluate(() => { const one = document.querySelector('[data-qa-scroll]'); return Math.round(one.scrollHeight - one.clientHeight - one.scrollTop) })); await h.waitForTimeout(200) }
  check('side by side, Settings scrolls to its very end and stays there', at.slice(-6).every((one) => one <= 1), JSON.stringify(at))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
