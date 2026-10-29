// Every popup that scrolls looks like the right-click menu (the gold standard:
// 8px corners, 28px rows) and fades at an edge only while rows are hidden past
// it: the / menu and the @ menu (the # tag menu is the same list), long and short.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/menu-fade.mjs
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
// The fade's two edges, read off the list: what --mf-less (top) and --mf-more (bottom) are now.
const edges = (sel) => h.evaluate((sel) => {
  const list = document.querySelector(sel)
  if (!list) return null
  const cs = getComputedStyle(list)
  const box = list.closest('.tiptap-slash-menu, [data-slot=popover-content]') ?? list
  const row = list.querySelector('button, [cmdk-item]')
  return { top: parseFloat(cs.getPropertyValue('--mf-less')), bottom: parseFloat(cs.getPropertyValue('--mf-more')), scrolls: list.scrollHeight > list.clientHeight + 1, radius: parseFloat(getComputedStyle(box).borderTopLeftRadius), row: row ? Math.round(row.getBoundingClientRect().height) : 0, font: row ? getComputedStyle(row).fontSize : '' }
}, sel)
const toEnd = (sel) => h.evaluate((sel) => { const list = document.querySelector(sel); list.scrollTop = list.scrollHeight }, sel)
const typeAtEnd = async (text) => {
  await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.chain().focus('end').insertContent({ type: 'paragraph' }).run() })
  await h.keyboard.type(text, { delay: 30 }); await wait(500)
}
const clear = async () => { await h.keyboard.press('Escape'); await h.evaluate(() => { const ed = document.querySelector('[data-open] .tiptap').editor; ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Menus' }] }] }) }); await wait(300) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (let n = 0; n < 14; n++) { const one = await v('article:new'); await v('item:save', one, { title: `Linked${n}`, body: { type: 'doc', content: [p('x')] }, tags: [`tag${n}`] }) }
  const id = await v('article:new')
  await v('item:save', id, { title: 'Menus', body: { type: 'doc', content: [p('Menus')] } })
  await c.send('article', id); await wait(1500)
  for (const theme of ['light', 'dark']) {
    await c.theme(theme); await c.send('article', id); await wait(1500)
    // The gold standard: the right-click menu.
    await h.locator('[data-slot=context-menu-trigger]').first().click({ button: 'right' }); await wait(450)
    const gold = await h.evaluate(() => {
      const box = document.querySelector('[data-slot=context-menu-content], [data-slot=dropdown-menu-content]')
      const row = box?.querySelector('[role^=menuitem]')
      return box && row ? { radius: parseFloat(getComputedStyle(box).borderTopLeftRadius), row: Math.round(row.getBoundingClientRect().height), font: getComputedStyle(row).fontSize } : null
    })
    check(`${theme}: the right-click menu opens (the gold standard)`, !!gold, JSON.stringify(gold))
    if (SHOT) await h.screenshot({ path: `${SHOT}/${theme}-gold.png` })
    await h.keyboard.press('Escape'); await wait(250)
    await h.locator('[data-open] .tiptap p').first().click(); await wait(250)
    for (const [name, typed, short] of [['/ menu', '/', '/heading'], ['@ menu', '@', '@Linked13']]) {
      await typeAtEnd(typed)
      const sel = '.tiptap-slash-menu-list'
      const top = await edges(sel)
      check(`${theme} ${name}: opens and scrolls`, top?.scrolls, JSON.stringify(top))
      if (!top) { await clear(); continue }
      check(`${theme} ${name}: same corners and rows as the right-click menu`, gold && top.radius === gold.radius && Math.abs(top.row - gold.row) <= 1 && top.font === gold.font, `radius ${top.radius} vs ${gold?.radius}, row ${top.row} vs ${gold?.row}, text ${top.font} vs ${gold?.font}`)
      check(`${theme} ${name}: at the top, fades at the foot only`, top.bottom > 20 && top.top === 0, JSON.stringify(top))
      if (SHOT) await h.screenshot({ path: `${SHOT}/${theme}-${name[0] === '/' ? 'slash' : name[0] === '@' ? 'at' : 'tag'}.png` })
      await toEnd(sel); await wait(200)
      const end = await edges(sel)
      check(`${theme} ${name}: scrolled to the end, fades at the top only`, end.top > 10 && end.bottom === 0, JSON.stringify(end))
      await clear()
      await typeAtEnd(short)
      const fit = await edges(sel)
      check(`${theme} ${name}: a list that fits has no fade`, fit && !fit.scrolls && fit.top === 0 && fit.bottom === 0, JSON.stringify(fit))
      await clear()
    }
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
