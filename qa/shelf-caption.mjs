// A click on the book's name under the shelf, in the Haligtree menu, chooses nothing: the menu used to hand a click
// between its rows to the nearest one, and the name sits just over "New book…" (the user, 22 Nov).
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h } = c
try {
  await h.waitForTimeout(800)
  await h.locator('[aria-label="Haligtree menu"]:not([data-book-more])').click(); await h.waitForTimeout(700)
  const shelf = await h.locator('[data-book-shelf]').count()
  const cap = await h.locator('[data-book-caption]').boundingBox()
  if (cap) {
    await h.mouse.move(cap.x + cap.width / 2, cap.y + 10, { steps: 4 }); await h.waitForTimeout(200)
    await h.mouse.click(cap.x + cap.width / 2, cap.y + 10); await h.waitForTimeout(600)
  }
  const after = await h.evaluate(() => ({ naming: !!document.querySelector('[data-new-book]'), hi: document.querySelector('[role="menuitem"][data-highlighted]')?.textContent ?? null, focus: document.activeElement?.textContent?.slice(0, 30) }))
  await h.screenshot({ path: `${process.env.QA_SHOTS}/caption.png` })
  check('a click on the book name under the shelf starts no new book', !after.naming, JSON.stringify(after))
} catch (error) { check('ran', false, error.stack) } finally { await c.close() }
done()
