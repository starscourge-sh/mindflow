// ⌘K is Notion's: the left a plain list in sections (before typing "Actions" and "Recent", typed a section a kind,
// "Notes", "Gems", "Tasks"..., a few each with "Show N more"), no boxes round them; the right ONE framed card (its own
// fill, a hairline, rounded corners, inset) holding what is close to hand (Today, Pinned) under the lit action, or the
// lit result's preview. ↓ walks every row of every section, a folded section's rows are skipped, Enter opens the lit
// row, ⌘-click picks one.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cmdk-islands.mjs
// SHOT=<folder> keeps the pictures, light and dark, and a frame every 50ms while typing.
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 800, at: CALM_HOUR })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOT
await v('settings:set', { sounds: false, hintRate: 0 })
const heads = () => h.evaluate(() => [...document.querySelectorAll('[role="dialog"] [data-island-head]')].map((one) => one.dataset.islandHead))
const lit = () => h.evaluate(() => { const row = document.querySelector('[role="dialog"] [data-search-at]'); return row && { island: row.closest('[data-island]')?.dataset.island, text: row.textContent.slice(0, 30) } })

try {
  if (shots) { await c.go('inbox'); await wait(1500); await c.both(`${shots}/islands-inbox`) }
  await c.go('home'); await wait(1200)
  await h.keyboard.press('Meta+k'); await wait(700)
  const before = await heads()
  check('before typing: an "Actions" island, then "Recent"', before[0] === 'Actions' && before[1] === 'Recent', JSON.stringify(before))
  // The left: plain sections, no box round any of them. The right: one framed card, a fill of its own.
  const look = () => h.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Search"] > div')
    const list = document.querySelector('[data-answers]')
    const panels = [...document.querySelectorAll('[role="dialog"] [data-cmdk-panel]')]
    const panel = panels[0]
    const css = panel && getComputedStyle(panel)
    const box = panel?.getBoundingClientRect()
    const outer = dialog?.getBoundingClientRect()
    return {
      boxedLeft: list ? [...list.querySelectorAll('[data-island]')].filter((one) => !one.hasAttribute('data-plain') || one.querySelector('.mf-island')).map((one) => one.dataset.island) : ['no list'],
      panels: panels.length,
      framed: !!css && parseFloat(css.borderTopWidth) >= 1 && parseFloat(css.borderTopLeftRadius) >= 10,
      ownFill: !!css && css.backgroundColor !== getComputedStyle(dialog).backgroundColor && css.backgroundColor !== 'rgba(0, 0, 0, 0)',
      inset: !!box && box.right <= outer.right - 8 && box.top - list.getBoundingClientRect().top >= 8,
      inside: panel ? [...panel.querySelectorAll('[data-island]')].map((one) => one.dataset.island) : [],
      boxesInside: panel ? panel.querySelectorAll('.mf-island').length : -1
    }
  })
  const rest = await look()
  console.log('  at rest:', JSON.stringify(rest))
  check('at rest: no box round any section on the left', rest.boxedLeft.length === 0, JSON.stringify(rest.boxedLeft))
  check('at rest: one framed card on the right (hairline, 10px+ corners, a fill of its own, inset)', rest.panels === 1 && rest.framed && rest.ownFill && rest.inset, JSON.stringify(rest))
  check('at rest: Today and Pinned sit inside that card, plainly, no boxes in it', rest.inside.length > 0 && rest.inside.every((name) => ['Today', 'Pinned'].includes(name)) && rest.boxesInside === 0, JSON.stringify(rest.inside))
  if (shots) await c.both(`${shots}/islands-cmdk-before`)
  // ↓ onto the first Recent row: its preview fills the same card.
  while ((await lit())?.island === 'Actions') { await h.keyboard.press('ArrowDown'); await wait(60) }
  await wait(700)
  const previewing = await look()
  const preview = await h.evaluate(() => { const panel = document.querySelector('[data-cmdk-panel]'); return { editor: !!panel?.querySelector('.ProseMirror'), text: panel?.innerText.slice(0, 60) ?? '' } })
  check('a Recent row lit: its preview shows in the same one card', previewing.panels === 1 && previewing.framed && (preview.editor || preview.text.length > 0), JSON.stringify(preview))
  if (shots) await c.both(`${shots}/islands-cmdk-preview`)
  // Typed: a frame every 50ms as the words go in.
  const frames = []
  const filming = (async () => { for (let i = 0; i < 16; i++) { if (shots) frames.push(await h.screenshot({ path: `${shots}/islands-type-${String(i).padStart(2, '0')}.png` })); await wait(50) } })()
  await h.keyboard.type('the', { delay: 60 })
  await filming; await wait(900)
  const typed = await heads()
  console.log('  typed "the":', typed.join(' | '))
  check('typed: one island a kind, notes before tasks', typed.includes('Notes') && (!typed.includes('Tasks') || typed.indexOf('Notes') < typed.indexOf('Tasks')), JSON.stringify(typed))
  const most = await h.evaluate(() => Math.max(...[...document.querySelectorAll('[role="dialog"] [data-island]')].filter((one) => one.dataset.island !== 'Actions').map((one) => one.querySelectorAll('[data-drag-open]').length)))
  check('typed: a few rows an island (five at most before "Show more")', most <= 5, most)
  const more = await h.evaluate(() => document.querySelector('[role="dialog"] [data-island-more]')?.textContent ?? null)
  check('typed: a long island says "Show N more"', !more || /^Show \d+ more/.test(more), more)
  const typedLook = await look()
  check('typed: still no box round any section on the left, one card on the right', typedLook.boxedLeft.length === 0 && typedLook.panels === 1, JSON.stringify(typedLook))
  if (shots) await c.both(`${shots}/islands-cmdk-typed`)
  // ↓ walks across islands.
  const seen = new Set()
  const count = await h.evaluate(() => document.querySelectorAll('[role="dialog"] [data-search-at], [role="dialog"] button[data-row], [role="dialog"] [data-action-label]').length)
  for (let i = 0; i < 40; i++) { const one = await lit(); if (one?.island) seen.add(one.island); await h.keyboard.press('ArrowDown'); await wait(40) }
  check('↓ reaches a row in every island', typed.every((name) => seen.has(name)), JSON.stringify([...seen]))
  // Fold the first kind's island: ↓ no longer stops in it.
  await h.locator('[data-answers]').evaluate((list) => (list.scrollTop = 0))
  const first = typed.find((name) => name !== 'Actions')
  await h.click(`[role="dialog"] [data-island-head="${first}"]`); await wait(300)
  check('a folded island\'s head keeps the keys in the box', await h.evaluate(() => document.activeElement?.matches('[role="dialog"] input')))
  await h.keyboard.press('ArrowUp')
  const after = new Set()
  for (let i = 0; i < 40; i++) { const one = await lit(); if (one?.island) after.add(one.island); await h.keyboard.press('ArrowDown'); await wait(30) }
  check(`folded "${first}": ↓ skips its rows`, !after.has(first), JSON.stringify([...after]))
  await h.click(`[role="dialog"] [data-island-head="${first}"]`); await wait(300)
  // ⌘-click picks a row; Enter on a lit row opens it.
  await h.click('[role="dialog"] button[data-row]', { modifiers: ['Meta'] }); await wait(300)
  check('⌘-click picks a row', await h.evaluate(() => !!document.querySelector('[role="dialog"] button[data-row][data-picked]')))
  await h.keyboard.press('Escape'); await wait(400)
  await h.keyboard.press('Meta+k'); await wait(600); await h.keyboard.type('the', { delay: 30 }); await wait(1000)
  while ((await lit())?.island === 'Actions') await h.keyboard.press('ArrowDown')
  const want = await lit()
  await h.keyboard.press('Enter'); await wait(1200)
  check('Enter opens the lit row and closes ⌘K', !(await h.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Search"]'))), JSON.stringify(want))
  // The window at its smallest.
  await c.size(560, 400); await wait(400)
  await h.keyboard.press('Meta+k'); await wait(600); await h.keyboard.type('the', { delay: 30 }); await wait(1000)
  const wide = await h.evaluate(() => { const list = document.querySelector('[data-answers]'); return list.scrollWidth <= list.clientWidth + 1 })
  check('560 wide: no sideways scroll in the list', wide)
  if (shots) await c.both(`${shots}/islands-cmdk-560`)
  await h.keyboard.press('Escape')
  console.log(c.errors.length ? c.errors.join('\n') : 'no page errors')
} finally {
  await c.close()
}
done()
