// The block menu and the / menu never run past the window: capped near 60%
// of it, scrolling inside, ending in "Close menu  esc" as Notion's does. The
// handle is Notion's six-dot grip, in notes, a task's details and the box.
// FAILS if any menu's foot is below the window's, at 900x700 and 1600x1000.
// Also: the two page buttons on the selection bar have their own icons and names.
//   npx electron-vite build --outDir out-links
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-links/main/index.js HALIGTREE_QA_AWAY=1 node qa/menu-cap.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/shots/editor-links'
mkdirSync(SHOTS, { recursive: true })
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const { check, done } = checks()
const c = await sandbox({ width: 900, height: 700 })
const { h, page: box, send, size, theme, close, errors, v } = c
const wait = (ms) => h.waitForTimeout(ms)

const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })

/** The open menu's box and the window's, and whether its list scrolls inside it. */
const menuBox = (win, selector) => win.evaluate((sel) => {
  const menu = document.querySelector(sel)
  if (!menu) return null
  const box = menu.getBoundingClientRect()
  const list = menu.querySelector('.tiptap-block-menu-list, .tiptap-slash-menu-list')
  const closeRow = menu.querySelector('[data-close-menu]')
  const closeBox = closeRow?.getBoundingClientRect()
  return { top: box.top, bottom: box.bottom, height: box.height, win: innerHeight, scrolls: !!list && list.scrollHeight > list.clientHeight + 1, close: closeRow ? [...closeRow.children].map((one) => one.textContent.trim()).join(' ') : null, closeInside: !!closeBox && closeBox.bottom <= box.bottom + 1 && closeBox.top >= box.top - 1 }
}, selector)

/** Hover the nth line, click its grip: the block menu. */
const openBlockMenu = async (win, editor, nth = 0) => {
  const line = win.locator(`${editor} > p`).nth(nth)
  await line.hover()
  await win.waitForTimeout(250)
  await win.locator('.tiptap-drag-handle-grip').first().click()
  await win.waitForTimeout(500)
}

const dots = (win) => win.evaluate(() => {
  const svg = document.querySelector('.tiptap-drag-handle-grip svg')
  return svg ? svg.querySelectorAll('path[d^="M9 "], path[d^="M15 "]').length : -1
})

try {
  const lines = Array.from({ length: 30 }, (_, i) => p(`Line ${i + 1} of a long note for the menu probe`))
  const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [p('Menu cap probe'), ...lines] })
  for (const [w, hh] of [[900, 700], [1600, 1000]]) {
    await size(w, hh)
    for (const look of ['paper', 'dark']) {
      await theme(look)
      await send('capture', id)
      await wait(1500)
      await h.locator(ED).waitFor({ timeout: 8000 })
      // A line low on the page, so the menu has the least room below it.
      const low = await h.evaluate((sel) => {
        const all = [...document.querySelectorAll(`${sel} > p`)]
        return all.findIndex((one) => one.getBoundingClientRect().bottom > innerHeight - 140)
      }, ED)
      await openBlockMenu(h, ED, Math.max(1, low))
      const m = await menuBox(h, '.tiptap-block-menu')
      const tag = `${w}x${hh} ${look}`
      check(`${tag}: the block menu opens`, !!m, JSON.stringify(m))
      check(`${tag}: the block menu never runs past the window`, m && m.bottom <= m.win + 0.5 && m.top >= -0.5, JSON.stringify(m))
      check(`${tag}: it is capped near 60% of the window and scrolls inside`, m && m.height <= m.win * 0.6 + 1 && m.scrolls, JSON.stringify(m))
      check(`${tag}: it ends in "Close menu esc", in sight`, m && m.close === 'Close menu esc' && m.closeInside, JSON.stringify(m))
      await h.screenshot({ path: `${SHOTS}/block-menu-${w}-${look}.png` })
      if (look === 'paper' && w === 900) {
        await h.locator('.tiptap-block-menu [data-close-menu]').click()
        await wait(400)
        check('"Close menu" closes it', !(await h.locator('.tiptap-block-menu').count()))
        check('the handle is the six-dot grip', (await dots(h)) === 6, String(await dots(h)))
      } else await h.keyboard.press('Escape')
      await wait(300)

      // The / menu at the foot of the note.
      await h.$eval(ED, (el) => el.editor.chain().focus('end').run())
      await h.keyboard.press('Enter')
      await h.keyboard.type('/')
      await wait(600)
      const s = await menuBox(h, '.tiptap-slash-menu')
      check(`${tag}: the / menu never runs past the window`, s && s.bottom <= s.win + 0.5 && s.top >= -0.5 && s.height <= s.win * 0.6 + 1, JSON.stringify(s))
      check(`${tag}: the / menu ends in "Close menu esc"`, s && s.close === 'Close menu esc' && s.closeInside, JSON.stringify(s))
      await h.screenshot({ path: `${SHOTS}/slash-menu-${w}-${look}.png` })
      if (look === 'dark' && w === 900) {
        await h.locator('.tiptap-slash-menu [data-close-menu]').click()
        await wait(300)
        const left = await h.$eval(ED, (el) => el.editor.getText().endsWith('/'))
        check('"Close menu" closes the / menu and takes its / with it', !(await h.locator('.tiptap-slash-menu').count()) && !left)
      } else await h.keyboard.press('Escape')
      await wait(300)
      await h.$eval(ED, (el) => { const e = el.editor; const json = e.getJSON(); json.content = json.content.filter((n) => n.content?.length); e.commands.setContent(json) })
    }
  }
  await theme('paper')
  await size(900, 700)

  // A task's details: the same handle, the same cap.
  const task = await v('task:add', 'Menu cap probe task', undefined, true)
  await send('task', task.id)
  await wait(1500)
  const DESC = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  const desc = h.locator(DESC).last()
  await desc.click()
  await h.keyboard.type('First line of the details')
  await wait(300)
  const descSel = await h.evaluate((sel) => { const all = [...document.querySelectorAll(sel)]; const one = all.at(-1); one?.setAttribute('data-probe-desc', ''); return one ? '[data-probe-desc]' : null }, DESC)
  if (descSel) {
    await openBlockMenu(h, descSel, 0)
    const m = await menuBox(h, '.tiptap-block-menu')
    check("a task's details: the block menu stays in the window, capped", m && m.bottom <= m.win + 0.5 && m.height <= m.win * 0.6 + 1, JSON.stringify(m))
    check("a task's details: six-dot grip", (await dots(h)) === 6)
    await h.screenshot({ path: `${SHOTS}/block-menu-task.png` })
    await h.keyboard.press('Escape')
  } else check("a task's details editor found", false)

  // The box.
  const BOX = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
  await box.evaluate(() => window.api.showPrompt?.())
  await box.waitForTimeout(800)
  await box.locator(BOX).first().click().catch(() => {})
  await box.keyboard.type('A line in the box')
  await box.waitForTimeout(300)
  await box.locator(`${BOX} > p`).first().hover().catch(() => {})
  await box.waitForTimeout(300)
  const boxGrip = await dots(box)
  check('the box: six-dot grip', boxGrip === 6 || boxGrip === -1, `dots ${boxGrip} (-1: the box shows no handle)`)
  if (boxGrip === 6) {
    await box.locator('.tiptap-drag-handle-grip').first().click()
    await box.waitForTimeout(500)
    const m = await menuBox(box, '.tiptap-block-menu')
    check('the box: the block menu stays in the window', !m || (m.bottom <= m.win + 0.5 && m.top >= -0.5), JSON.stringify(m))
    await box.screenshot({ path: `${SHOTS}/block-menu-box.png` })
    await box.keyboard.press('Escape')
  }

  // The two page buttons on the selection bar: own icons, plain names.
  await send('capture', id)
  await wait(1500)
  await h.locator(`${ED} > p`).nth(2).click({ clickCount: 3 })
  await wait(700)
  const buttons = await h.evaluate(() => {
    const move = document.querySelector('[data-turn-into-page]')
    const share = document.querySelector('[data-pull-out]')
    return move && share && { move: move.getAttribute('aria-label'), share: share.getAttribute('aria-label'), sameIcon: move.querySelector('svg')?.innerHTML === share.querySelector('svg')?.innerHTML }
  })
  check('the bar names them "Move to a new page" and "Share with a new page"', buttons?.move === 'Move to a new page' && buttons?.share === 'Share with a new page', JSON.stringify(buttons))
  check('each has its own icon', buttons && !buttons.sameIcon)
  await h.locator('[data-pull-out]').hover()
  await wait(700)
  await h.screenshot({ path: `${SHOTS}/share-tip.png` })
  check('no page errors', !errors.some((e) => /PAGEERROR/.test(e)), errors.join(' | '))
} finally {
  await close()
}
done()
