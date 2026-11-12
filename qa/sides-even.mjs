// One room at the left and at the right of the three small things a folder's page shows together: its tab, the path
// part "Gems" over it, and that part's tip with its key. Reported 12 Nov with a picture of all three: "is there
// consistency in the left and right padding of 'gems', of the tooltip and of the tab? ... tab looks thin on the sides".
// Found then: the open tab's shape was drawn a quarter rem in from each side of its place, so its icon and its ✕ sat
// half as far from its edge as the other tabs' do from theirs; a tip holding a key had 10px at the words' side and 6px
// at the key's.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/sides-even.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const near = (a, b, by = 1) => a !== null && b !== null && Math.abs(a - b) <= by

/** Each tab in sight: how far its icon stands in from the left edge of its drawn shape, and its ✕ from the right edge. */
const tabs = () => h.evaluate(() => [...document.querySelectorAll('[data-tab]')].filter((one) => one.getClientRects().length).map((one) => {
  const on = one.hasAttribute('data-tab-on')
  // The shape drawn: the open tab's own surface, another tab's button.
  const shape = (on ? one.querySelector(':scope > span[aria-hidden]') : one.querySelector('button[role="tab"]'))?.getBoundingClientRect()
  const icon = one.querySelector('button[role="tab"] svg')?.getBoundingClientRect()
  const close = one.querySelector('[data-tab-close]')?.getBoundingClientRect()
  const round = (n) => Math.round(n * 10) / 10
  return { name: one.getAttribute('data-drag-title'), on, left: shape && icon ? round(icon.left - shape.left) : null, right: shape && close ? round(shape.right - close.right) : null }
}))

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await c.go('nuggets'); await wait(900)
  // A second tab, so an open one and another stand side by side.
  await h.keyboard.press('Meta+t'); await wait(700)
  await c.go('nuggets'); await wait(900)
  await h.locator('[data-group-row]').first().dblclick({ position: { x: 120, y: 18 } }); await wait(900)
  check('a folder\'s page is open, its path over it', await h.locator('[data-path-bar] [data-folder-back]').count() === 1)

  for (const theme of ['light', 'dark']) {
    await c.theme(theme); await wait(400)
    const seen = await tabs()
    const open = seen.find((one) => one.on), other = seen.find((one) => !one.on)
    check(`${theme}: an open tab and another are in sight`, !!open && !!other, JSON.stringify(seen))
    check(`${theme}: the open tab has the same room at its left (to its icon) as at its right (to its ✕)`, !!open && near(open.left, open.right), JSON.stringify(open))
    check(`${theme}: another tab has the same room at both sides too`, !!other && near(other.left, other.right), JSON.stringify(other))
    check(`${theme}: the open tab's side room is the other tabs' (it was half of theirs)`, !!open && !!other && near(open.left, other.left) && near(open.right, other.right), JSON.stringify({ open, other }))
    check(`${theme}: and that room is half a rem, not a sliver (7px or more)`, !!open && open.left >= 7 && open.right >= 7, JSON.stringify(open))

    // The path's first part, and its tip with its key.
    const back = h.locator('[data-path-bar] [data-folder-back]')
    const part = await back.evaluate((one) => {
      const words = one.querySelector('span') ?? one
      const range = document.createRange(); range.selectNodeContents(words)
      const text = range.getBoundingClientRect(), box = one.getBoundingClientRect()
      return { left: Math.round((text.left - box.left) * 10) / 10, right: Math.round((box.right - text.right) * 10) / 10 }
    })
    check(`${theme}: the path's part has the same room at both sides`, near(part.left, part.right), JSON.stringify(part))
    const at = await back.boundingBox()
    await h.mouse.move(at.x - 60, at.y + 40); await wait(150)
    await h.mouse.move(at.x + at.width / 2, at.y + at.height / 2, { steps: 6 }); await wait(1100)
    const tip = await h.evaluate(() => {
      const one = [...document.querySelectorAll('[data-slot="tooltip-content"]')].find((each) => each.getClientRects().length)
      if (!one) return null
      const key = one.querySelector('[data-slot="kbd"]')
      // The first words in it: the first text that is not inside the key.
      const walk = document.createTreeWalker(one, NodeFilter.SHOW_TEXT)
      let words = null
      for (let node = walk.nextNode(); node && !words; node = walk.nextNode()) if (node.nodeValue.trim() && !key?.contains(node)) words = node
      if (!words || !key) return { said: one.textContent, key: !!key }
      const range = document.createRange(); range.selectNodeContents(words)
      const box = one.getBoundingClientRect()
      return { said: one.textContent, left: Math.round((range.getBoundingClientRect().left - box.left) * 10) / 10, right: Math.round((box.right - key.getBoundingClientRect().right) * 10) / 10 }
    })
    check(`${theme}: the part's tip comes up, with its key`, !!tip && tip.left !== undefined, JSON.stringify(tip))
    check(`${theme}: the tip has the same room at its words' side as at its key's`, !!tip && near(tip.left ?? null, tip.right ?? null, 1.5), JSON.stringify(tip))
    if (shots) await h.screenshot({ path: `${shots}/sides-${theme}.png`, clip: { x: 250, y: 40, width: 620, height: 190 } })
    await h.mouse.move(700, 600); await wait(400)
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
}
done()
