// A voice note's block menu in quick capture, in a short window, dark:
// a right-click anywhere on the block (each corner, the middle) opens the
// block's one menu, never the note's own; the menu fits the window (whole rows
// only, the list scrolling with fades), is one surface, and does not cover the
// block's title and time.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/block-menu-short.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1200)
}
// The box's window, short, as the user had it.
const boxSize = (w, hh) => electron.evaluate(({ BrowserWindow }, [w, hh]) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=home') && one.isVisible())
  win?.setBounds({ width: w, height: hh })
}, [w, hh])
const dark = (on) => page.evaluate((on) => { localStorage.setItem('theme', on ? 'dark' : 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, on)
const menus = () => page.evaluate(() => ({
  block: [...document.querySelectorAll('.tiptap-block-menu[data-state="open"]')].length,
  note: [...document.querySelectorAll('[role="menu"]:not(.tiptap-block-menu)')].filter((m) => m.getBoundingClientRect().height > 0).length,
  first: [...document.querySelectorAll('[role="menu"]')].map((m) => m.innerText.split('\n').slice(0, 2).join(' / ')).join(' | ')
}))
const shut = async () => { await page.keyboard.press('Escape'); await wait(300); await page.mouse.click(5, 5); await wait(300) }

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  await reopen()
  await page.evaluate(() => {
    localStorage.setItem('capture-draft', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ihekfw' }] }, { type: 'attachment', attrs: { src: 'haligtree://assets/' + 'a'.repeat(64) + '.m4a', name: 'Voice note 31 Oct 9.12.m4a', size: 935731, duration: 56.4 } }, { type: 'paragraph' }] }))
    localStorage.setItem('capture-draft-at', String(Date.now() - 3 * 3600_000))
  })
  // Left hours ago, it waits in the "Still to keep" chip: one click puts it back in the box.
  await reopen()
  await page.click('[data-leftover]'); await wait(600)
  await boxSize(760, 470); await wait(600)
  await dark(true); await wait(500)
  const box = await page.evaluate((sel) => {
    const r = document.querySelector(`${sel} .tiptap-attachment.is-audio`)?.getBoundingClientRect()
    return r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }, EDITOR)
  check('the voice note is in the box', !!box, box ? JSON.stringify(box) : await page.evaluate((sel) => document.querySelector(sel)?.innerHTML.slice(0, 300) ?? 'no editor', EDITOR))
  if (!box) throw new Error('no voice note')
  // The lone word above the recording is looked up: whatever it shows never covers
  // the empty line's "Write a thought…" or the recording's card.
  await wait(2500)
  const cover = await page.evaluate((sel) => {
    const meets = (a, b) => a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const placeholder = document.querySelector(`${sel} > p.is-empty`)?.getBoundingClientRect()
    const card = document.querySelector(`${sel} .tiptap-attachment-card`).getBoundingClientRect()
    const shown = [...document.querySelectorAll('[data-define]')].filter((el) => getComputedStyle(el).visibility !== 'hidden')
    return shown.map((el) => {
      const inner = [...el.querySelectorAll('*')].map((one) => one.getBoundingClientRect()).filter((r) => r.width)
      return { define: el.dataset.define, onPlaceholder: !!placeholder && inner.some((r) => meets(r, placeholder)), onCard: inner.some((r) => meets(r, card)) }
    })
  }, EDITOR)
  check('the word\'s lookup never covers "Write a thought…" or the recording', cover.every((one) => !one.onPlaceholder && !one.onCard), JSON.stringify(cover))
  // A recording with no words under it says so, with the way to get them.
  const words = await page.evaluate((sel) => document.querySelector(`${sel} .tiptap-attachment.is-audio [data-no-words]`)?.innerText.replace(/\s+/g, ' ').trim() ?? null, EDITOR)
  check('a recording without words says "No transcript · Transcribe"', words === 'No transcript · Transcribe', String(words))
  // The header's top right: the "pinned" chip and the window's pill, one shape.
  const header = await page.evaluate(() => {
    const look = (el) => { if (!el) return null; const s = getComputedStyle(el); return { h: Math.round(el.getBoundingClientRect().height), border: s.borderTopWidth + ' ' + s.borderTopColor, fill: s.backgroundColor, radius: s.borderTopLeftRadius } }
    return { chip: look(document.querySelector('[data-waiting]')), pill: look(document.querySelector('.mf-pill')) }
  })
  check('the "pinned" chip and the window pill are one shape (height, hairline, fill)', header.chip && header.pill && JSON.stringify(header.chip) === JSON.stringify(header.pill), JSON.stringify(header))
  const spots = { 'top right': [box.right - 3, box.top + 3], 'top left': [box.left + 3, box.top + 3], 'bottom right': [box.right - 3, box.bottom - 3], 'bottom left': [box.left + 3, box.bottom - 3], middle: [(box.left + box.right) / 2, (box.top + box.bottom) / 2] }
  for (const [name, [x, y]] of Object.entries(spots)) {
    const under = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return `${el?.tagName} ${String(el?.className).slice(0, 60)} inPM=${!!el?.closest('.ProseMirror')}` }, [x, y])
    await page.mouse.click(x, y, { button: 'right' }); await wait(500)
    const m = { ...(await menus()), under }
    check(`a right-click at the block's ${name} opens its block menu, alone`, m.block === 1 && m.note === 0, JSON.stringify(m))
    if (name === 'top right' && m.block) {
      await page.screenshot({ path: `${shots}/block-menu-short-dark.png` })
      const fit = await page.evaluate((sel) => {
        const menu = document.querySelector('.tiptap-block-menu[data-state="open"]')
        const r = menu.getBoundingClientRect()
        const list = menu.querySelector('.tiptap-block-menu-list')
        const close = menu.querySelector('[data-close-menu]').getBoundingClientRect()
        // Drawn surfaces: anything in the menu's layer with a fill or a shadow of its own.
        const layer = menu.closest('[data-radix-popper-content-wrapper]') ?? menu
        const surfaces = [layer, ...layer.querySelectorAll('*')].filter((el) => {
          const s = getComputedStyle(el)
          const box = el.getBoundingClientRect()
          return box.width > 120 && box.height > 120 && (s.boxShadow !== 'none' || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'))
        }).map((el) => el.className.toString().slice(0, 60))
        const block = document.querySelector(`${sel} .tiptap-attachment.is-audio`).getBoundingClientRect()
        // The block's title line: its top 40px.
        const covers = r.left < block.right && block.left < r.right && r.top < block.top + 40 && block.top < r.bottom
        return {
          inWindow: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
          closeShown: close.bottom <= r.bottom + 0.5 && close.top >= r.top,
          listScrolls: list.scrollHeight > list.clientHeight + 1,
          outerScrolls: (() => { const s = menu.querySelector('[data-menu-scroll]'); return s ? s.scrollHeight > s.clientHeight + 1 : false })(),
          surfaces,
          covers
        }
      }, EDITOR)
      check('the menu fits the short window, "Close menu" whole under the list', fit.inWindow && fit.closeShown, JSON.stringify(fit))
      check('only the list scrolls (one scroller, not the whole menu)', !fit.outerScrolls, JSON.stringify(fit))
      check('the menu is one surface', fit.surfaces.length === 1, JSON.stringify(fit.surfaces))
      check('the menu does not cover the block\'s title and time', !fit.covers, JSON.stringify(fit))
    }
    await shut()
  }
  // Ten recordings in a row, at scale: a screenshot each way, and each card's height.
  await page.evaluate((sel) => {
    const editor = document.querySelector(sel).editor
    const one = (i) => ({ type: 'attachment', attrs: { src: 'haligtree://assets/' + String(i).repeat(64).slice(0, 64) + '.m4a', name: `Voice note 31 Oct 9.${10 + i}.m4a`, size: 935731, duration: 20 + i * 7 } })
    editor.commands.setContent({ type: 'doc', content: [...Array.from({ length: 10 }, (_, i) => one(i)), { type: 'paragraph' }] })
  }, EDITOR)
  await boxSize(760, 900); await wait(800)
  const stack = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .tiptap-attachment.is-audio`)].map((el) => Math.round(el.getBoundingClientRect().height)), EDITOR)
  check('ten recordings show as ten cards', stack.length === 10, JSON.stringify(stack))
  for (const on of [false, true]) { await dark(on); await wait(500); await page.screenshot({ path: `${shots}/voice-ten-${on ? 'dark' : 'light'}.png` }) }
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
