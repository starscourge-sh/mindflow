// A note's outline (the strip at its right edge), opened, is the right-click menu's twin: the same corners,
// 28px rows and text size, the menu's hover highlight, a fade at an edge while there is more past it, a
// long heading on one line ending in "…" (its words in full on hover), levels by indent alone, and the
// heading you are under in full weight, not in the theme's cursor colour.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/toc-menu.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? ''
if (SHOT) mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const hd = (level, text) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const body = [hd(1, 'PART 1: ANTHOLOGY - COMPLETE SOUND MAP OF EVERY TRACK AND EVERY CUE IN THE FILM')]
  for (let n = 0; n < 30; n++) body.push(hd(n % 3 === 0 ? 1 : n % 3 === 1 ? 2 : 3, `Section ${n + 1}`), p('words '.repeat(40)))
  const id = await v('article:new')
  await v('item:save', id, { title: 'Outline', body: { type: 'doc', content: body } })
  for (const theme of ['light', 'dark']) {
    await c.theme(theme); await c.send('article', id); await wait(1500)
    await h.locator('[data-slot=context-menu-trigger]').first().click({ button: 'right' }); await wait(450)
    const gold = await h.evaluate(() => {
      const box = document.querySelector('[data-slot=context-menu-content], [data-slot=dropdown-menu-content]')
      const row = box?.querySelector('[role^=menuitem]')
      return box && row ? { radius: parseFloat(getComputedStyle(box).borderTopLeftRadius), row: Math.round(row.getBoundingClientRect().height), font: getComputedStyle(row).fontSize, bg: getComputedStyle(box).backgroundColor } : null
    })
    if (SHOT) await h.screenshot({ path: `${SHOT}/toc-${theme}-menu.png` })
    await h.keyboard.press('Escape'); await wait(250)
    // The caret into the third heading, so it is the one you are under.
    await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').editor; let at = 0, n = 0; ed.state.doc.descendants((node, pos) => { if (node.type.name === 'heading' && ++n === 3) at = pos + 1 }); ed.commands.setTextSelection(at) })
    await wait(300)
    const strip = h.locator('.tiptap-toc').first()
    const box = await strip.boundingBox()
    await h.mouse.move(box.x + box.width - 4, box.y + 8); await wait(400)
    await h.locator('.tiptap-toc-item').nth(1).hover(); await wait(300)
    const got = await h.evaluate(() => {
      const nav = document.querySelector('.tiptap-toc')
      const list = nav.querySelector('.tiptap-toc-list')
      const rows = [...nav.querySelectorAll('.tiptap-toc-item')]
      const text = (one) => one.querySelector('.tiptap-toc-text')
      const active = rows.find((one) => one.dataset.active === 'true')
      const probe = document.createElement('span'); probe.style.color = 'var(--tt-cursor-color)'; document.body.append(probe)
      const cursor = getComputedStyle(probe).color; probe.style.color = 'var(--foreground)'; const fg = getComputedStyle(probe).color; probe.remove()
      const lvl = (n) => rows.find((one) => one.dataset.level === String(n))
      return {
        radius: parseFloat(getComputedStyle(nav).borderTopLeftRadius), bg: getComputedStyle(nav).backgroundColor,
        row: Math.round(rows[1].getBoundingClientRect().height), font: getComputedStyle(text(rows[1])).fontSize,
        hover: getComputedStyle(rows[1]).backgroundColor, hand: getComputedStyle(rows[1]).cursor,
        longLines: Math.round(text(rows[0]).getBoundingClientRect().height / parseFloat(getComputedStyle(text(rows[0])).lineHeight)), clipped: text(rows[0]).scrollWidth > text(rows[0]).clientWidth, title: rows[0].title,
        activeColor: getComputedStyle(text(active)).color, activeWeight: getComputedStyle(text(active)).fontWeight, cursor, fg,
        weights: [1, 2, 3].map((n) => getComputedStyle(text(lvl(n))).fontWeight), opacities: [1, 2, 3].map((n) => getComputedStyle(text(lvl(n))).opacity),
        indents: [1, 2, 3].map((n) => Math.round(text(lvl(n)).getBoundingClientRect().left)),
        trunks: document.querySelectorAll('.tiptap-toc .tiptap-toc-level > svg').length,
        fade: list ? { scrolls: list.scrollHeight > list.clientHeight + 1, more: parseFloat(getComputedStyle(list).getPropertyValue('--mf-more')) } : null
      }
    })
    const accent = await h.evaluate(() => { const s = document.createElement('span'); s.style.backgroundColor = 'var(--accent)'; document.body.append(s); const c = getComputedStyle(s).backgroundColor; s.remove(); return c })
    check(`${theme}: the right-click menu opens (the gold standard)`, !!gold, JSON.stringify(gold))
    check(`${theme}: opened, the outline has the menu's corners, rows and text size`, gold && got.radius === gold.radius && Math.abs(got.row - gold.row) <= 1 && got.font === gold.font, `radius ${got.radius} vs ${gold?.radius}, row ${got.row} vs ${gold?.row}, text ${got.font} vs ${gold?.font}`)
    check(`${theme}: the menu's surface`, gold && got.bg === gold.bg, `${got.bg} vs ${gold?.bg}`)
    check(`${theme}: a row pointed at has the menu's highlight and the hand`, got.hover === accent && got.hand === 'pointer', `${got.hover} vs ${accent}, ${got.hand}`)
    check(`${theme}: a long heading stays on one line, cut with its full words on hover`, got.longLines === 1 && got.clipped && got.title.startsWith('PART 1'), JSON.stringify({ lines: got.longLines, clipped: got.clipped }))
    check(`${theme}: the heading you are under is in full weight, not the cursor colour`, got.activeColor === got.fg && got.activeColor !== got.cursor && Number(got.activeWeight) >= 600, JSON.stringify({ c: got.activeColor, cursor: got.cursor, w: got.activeWeight }))
    check(`${theme}: levels step in under the heading above, off a trunk as the sidebar draws them`, new Set(got.opacities).size === 1 && got.trunks > 1 && got.indents[0] < got.indents[1] && got.indents[1] < got.indents[2], JSON.stringify({ w: got.weights, o: got.opacities, i: got.indents }))
    check(`${theme}: a long outline scrolls in the card, fading at the foot`, got.fade?.scrolls && got.fade.more > 10, JSON.stringify(got.fade))
    if (SHOT) await h.screenshot({ path: `${SHOT}/toc-${theme}.png` })
    await h.mouse.move(10, 400); await wait(300)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
