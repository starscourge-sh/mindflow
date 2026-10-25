// A card opened by pointing goes the moment what it points at scrolls: a
// note link's preview in a page, a list row's tip, a word's definition. Left
// open, each one stayed floating over the page after a scroll.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-scroll-away.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
const tips = () => h.evaluate(() => [...document.querySelectorAll('[data-slot="tooltip-content"]')].filter((one) => one.getBoundingClientRect().height > 0).length)
const preview = () => h.evaluate(() => !!document.querySelector('[data-note-preview]'))
// The wheel over the page where the pointer rests: as a person scrolls, the pointer never moving.
const wheel = async () => { await h.mouse.wheel(0, 500); await wait(500) }
try {
  // 1. A note link in a page: its preview, then a scroll.
  await go('articles'); await wait(1200)
  await h.getByText('Leonardo kept a commonplace book', { exact: true }).first().click(); await wait(1500)
  const link = h.locator('.ProseMirror a.tiptap-note-link').first()
  check('the page has a note link', (await link.count()) === 1)
  await link.scrollIntoViewIfNeeded(); await link.hover(); await wait(1200)
  check('pointing at the link shows its preview', await preview())
  await wheel()
  check('a scroll puts the preview away', !(await preview()))

  // 2. A tip on a list row's control, then a scroll of the list.
  await go('nuggets'); await wait(1200)
  const tipped = h.locator('main [data-row] [data-slot="tooltip-trigger"], [data-pane] [data-row] [data-slot="tooltip-trigger"]').first()
  if (await tipped.count()) {
    await tipped.hover(); await wait(900)
    const before = await tips()
    await wheel()
    check(`a row's tip goes with a scroll (${before} showing before)`, before === 0 || (await tips()) === 0)
  }

  // 3. A word's definition (a Term) in a note's thoughts, then a scroll.
  await go('articles'); await wait(1000)
  await h.getByText('Leonardo kept a commonplace book', { exact: true }).first().click(); await wait(1500)
  const term = h.locator('[data-pane] span[role="button"].cursor-help').first()
  if (await term.count()) {
    await term.scrollIntoViewIfNeeded(); await term.hover(); await wait(900)
    const before = await tips()
    await h.mouse.wheel(0, -400); await wait(500)
    check(`a word's definition goes with a scroll (${before} before)`, before === 0 || (await tips()) === 0)
  }
  check('no page errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()
