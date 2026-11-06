// A row reached by the arrow keys in a scrolling menu stops clear of the menu's edge fades, never in their shadow
// (the user, 6 Nov: the slash menu's "Callout" sat under the bottom fade). Walks the slash menu down and back up.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/menu-row-clear.mjs
import { checks } from './harness.mjs'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 760 })
const { h, send } = c
const wait = (ms) => h.waitForTimeout(ms)
try {
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A note' }] }] } }))
  await send('capture', note)
  await wait(1500)
  await h.click('.ProseMirror p:last-of-type')
  await h.keyboard.press('End')
  await h.keyboard.press('Enter')
  await h.keyboard.type('/')
  await wait(500)
  const where = () => h.evaluate(() => {
    const list = document.querySelector('.tiptap-slash-menu-list')
    const row = list?.querySelector('button.is-selected')
    if (!list || !row) return null
    const [a, r] = [list.getBoundingClientRect(), row.getBoundingClientRect()]
    const scrolls = list.scrollHeight > list.clientHeight + 1
    const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 1
    const atStart = list.scrollTop <= 1
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return { fade: Math.floor(2.5 * rem) - 1, topFade: Math.floor(1.5 * rem) - 1, above: Math.round(r.top - a.top), below: Math.round(a.bottom - r.bottom), scrolls, atEnd, atStart, text: row.textContent?.trim().slice(0, 20) }
  })
  const first = await where()
  check('the slash menu is open and scrolls', !!first?.scrolls, JSON.stringify(first))
  let worst = Infinity; let shown = ''; let seen = 0; let bar = 0
  for (let i = 0; i < 14; i++) {
    await h.keyboard.press('ArrowDown'); await wait(120)
    const at = await where()
    // Mid-list (the list not scrolled to its end) the row keeps the bottom fade's room (2.5rem) under it.
    if (at && !at.atEnd) { seen++; bar = at.fade; if (at.below < worst) (worst = at.below, shown = JSON.stringify(at)) }
  }
  check('going down, a row stops clear of the bottom fade', seen > 0 && worst >= bar, `${worst}px under the row ${shown}`)
  worst = Infinity; shown = ''; seen = 0
  for (let i = 0; i < 10; i++) {
    await h.keyboard.press('ArrowUp'); await wait(120)
    const at = await where()
    if (at && !at.atStart) { seen++; bar = at.topFade; if (at.above < worst) (worst = at.above, shown = JSON.stringify(at)) }
  }
  check('going up, a row stops clear of the top fade', seen > 0 && worst >= bar, `${worst}px over the row ${shown}`)
  await h.keyboard.press('Escape')
} catch (error) {
  check('the walk finishes', false, String(error).slice(0, 300))
} finally {
  await c.close()
  done()
}
