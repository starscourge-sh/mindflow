// Resting on a task's #tag on the Tasks page shows its card once and it stays: low in a short window the card opens above, and it used to land on the pointer first, then jump off and shut, over and over.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/tag-hover-steady.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: Number(process.env.W ?? 900), height: Number(process.env.H ?? 620) })
const { h, go } = c
try {
  await h.waitForTimeout(1500)
  await c.v('task:add', 'Water the plants #daily', undefined, true)
  await go('today')
  await h.waitForTimeout(1200)
  const tags = h.locator('[data-tag-go]')
  check('a task row carries a tag', await tags.count() > 0, String(await tags.count()))
  await tags.first().scrollIntoViewIfNeeded()
  await h.waitForTimeout(400)
  const box = await tags.first().boundingBox()
  // Every frame, what is up: a tooltip (not the card) and the card, logged in the page so a one-frame flash is caught.
  await h.evaluate(() => {
    window.__seen = []
    window.__tag = document.querySelector('[data-tag-go]')
    new MutationObserver(() => { if (!window.__tag.isConnected && !window.__gone) { window.__gone = 1; window.__seen.push('tag-replaced') } }).observe(document.body, { childList: true, subtree: true })
    document.addEventListener('mouseleave', (e) => e.target.matches?.('[data-note-preview]') && window.__seen.push('left-card'), true)
    addEventListener('scroll', (e) => window.__seen.push('scroll:' + (e.target.className?.slice?.(0, 60) ?? e.target.nodeName)), true)
    const tick = () => {
      const tip = [...document.querySelectorAll('[data-slot=tooltip-content]')].filter((one) => !one.closest('[data-note-preview]') && one.getBoundingClientRect().width > 0).map((one) => 'tip:' + one.textContent.trim().slice(0, 24))
      const card = [...document.querySelectorAll('[data-note-preview]')].filter((one) => one.getBoundingClientRect().width > 0 && getComputedStyle(one).opacity !== '0').length ? ['card'] : []
      const now = [...tip, ...card].join(',')
      if (window.__seen.at(-1) !== now) window.__seen.push(now)
      window.__raf = requestAnimationFrame(tick)
    }
    tick()
  })
  // In from the title, across the tag and resting on it, as a person would.
  await h.mouse.move(box.x - 80, box.y + box.height / 2)
  await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 })
  for (let i = 0; i < 30; i++) {
    await h.mouse.move(box.x + 3 + (i % 5) * (box.width - 6) / 4, box.y + box.height / 2)
    await h.waitForTimeout(80)
  }
  await h.waitForTimeout(800)
  const seen = await h.evaluate(() => (cancelAnimationFrame(window.__raf), window.__seen))
  console.log(JSON.stringify(seen))
  check('over the tag: nothing, then its card, and it stays (no flash)', seen.filter(Boolean).length <= 1 && seen.at(-1) === 'card', JSON.stringify(seen))
  check('no tooltip over the tag on top of its card', !seen.some((one) => one.includes('tip:')), JSON.stringify(seen))
  await h.screenshot({ path: process.env.SHOT ?? '/tmp/tag-hover.png' })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
