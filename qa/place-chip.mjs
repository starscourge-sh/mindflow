// The place chip over an open note never cuts its word (19 Nov: "Inbox" read "I…" at 1280 wide beside the list).
// A capture in the Inbox and a page in Writing, at 1280 and 560 wide: the chip's word is whole (or, in a pane too
// narrow for it, folded to its mark on purpose), and the header does not run past its own edge.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/place-chip.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { h, go, size, both, errors } = c
const ROWS = '[class*="@container/page"] button[data-row][data-id]'
const chip = () => h.evaluate(() => {
  const name = document.querySelector('[data-place-chip] [data-place-name]')
  if (!name) return null
  const folded = getComputedStyle(name).display === 'none'
  const head = name.closest('[class*="@container/head"]') ?? name.closest('header')
  return { text: name.textContent, whole: folded || name.scrollWidth <= name.clientWidth + 1, folded, overflow: head ? head.scrollWidth - head.clientWidth : 0 }
})
try {
  for (const [page, open] of [['inbox', async () => h.locator(ROWS).nth(1).click()], ['writing', async () => { const page = (await c.v('items', 'article'))[0]; await c.send('article', page.id) }]]) {
    for (const width of [1280, 560]) {
      await size(width, 800)
      await go(page)
      await open().catch(() => null)
      await h.waitForTimeout(1300)
      const seen = await chip()
      check(`${page} at ${width} wide: the chip's word "${seen?.text}" is whole${seen?.folded ? ' (folded to its mark)' : ''}`, seen && seen.whole, JSON.stringify(seen))
      check(`${page} at ${width} wide: the header stays inside its edge`, seen && seen.overflow <= 1, JSON.stringify(seen))
      if (process.env.SHOTS) await both(`${process.env.SHOTS}/q1-place-${page}-${width}`)
    }
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
