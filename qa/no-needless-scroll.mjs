// No page or panel scrolls unless its content truly does not fit, and nothing
// opens already scrolled. Every main-window page, every quick capture side
// panel tab (and the Saved tab's Gems, Writing and Questions), a note window
// and a sticky: empty (a fresh install), with the sandbox's few, and full, at
// a normal and a small window, light and dark. For each surface:
//   - a box that can scroll (scrollHeight > clientHeight) has words, a
//     picture or a control past its fold: never only padding or a tall box;
//   - nothing is set to overflow-y: scroll (a bar drawn with nothing to move);
//   - nothing has scrollTop > 0 just after opening.
//
//   npx electron-vite build --outDir out-scroll
//   QA_ENTRY=out-scroll/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/no-needless-scroll.mjs
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const VIEWS = ['home', 'inbox', 'review', 'day', 'today', 'week', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'all', 'weekpage', 'monthpage', 'upcoming', 'matrix', 'routines', 'later', 'tags', 'stats', 'map', 'discarded', 'archived', 'powers', 'settings']
const SIZES = [[1100, 760], [800, 540]]
const THEMES = ['paper', 'dark']
const dir = process.env.SHOTS
if (dir) mkdirSync(dir, { recursive: true })

let checked = 0
const failures = []
const shot = async (win, name) => { if (dir) await win.screenshot({ path: `${dir}/${name}.png` }).catch(() => {}) }

/** Every scroll box on show, and what is wrong with each. */
function measure() {
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className?.baseVal ?? el.className ?? '').split(/\s+/).slice(0, 6).join('.')}`.slice(0, 120)
  const problems = []
  const boxes = [document.scrollingElement, ...document.querySelectorAll('body *')]
  for (const el of boxes) {
    if (!el || (el !== document.scrollingElement && !el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }))) continue
    const css = getComputedStyle(el)
    const root = el === document.scrollingElement
    if (!root && css.overflowY === 'scroll' && el.clientHeight > 20) problems.push(`overflow-y: scroll on ${name(el)}`)
    if (!root && !/auto|scroll/.test(css.overflowY)) continue
    if (el.clientHeight < 24 || el.clientWidth < 24) continue
    if (el.scrollTop > 1) problems.push(`opened scrolled ${Math.round(el.scrollTop)}px: ${name(el)}`)
    const extra = el.scrollHeight - el.clientHeight
    if (extra <= 2) continue
    if (root && css.overflow === 'hidden') continue
    // Where this box's visible part ends, and whether anything real lies past it.
    const r = root ? { top: 0 } : el.getBoundingClientRect()
    const top = root ? 0 : r.top + el.clientTop
    const bottom = top + el.clientHeight
    let past = false
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    for (let node = walk.nextNode(); node && !past; node = walk.nextNode()) {
      let rect
      if (node.nodeType === 3) {
        if (!node.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rect = range.getBoundingClientRect()
      } else if (/^(IMG|SVG|CANVAS|VIDEO|INPUT|TEXTAREA|BUTTON|IFRAME|HR)$/i.test(node.tagName)) {
        rect = node.getBoundingClientRect()
      } else continue
      if (!rect.width || !rect.height) continue
      if (rect.bottom > bottom + 2 || rect.top < top - 2) past = true
    }
    if (!past) problems.push(`scrolls ${extra}px with nothing past the fold: ${name(el)}`)
  }
  return problems
}

async function check(win, label) {
  checked++
  const problems = await win.evaluate(measure).catch((e) => [`could not measure: ${e.message}`])
  if (problems.length) {
    failures.push(`${label}: ${problems.join(' | ')}`)
    console.log(`FAIL ${label}\n     ${problems.join('\n     ')}`)
  } else if (process.env.VERBOSE) console.log(`ok   ${label}`)
}

/** The Matrix and the week fit the window: the page never scrolls, each box or day does, and every title shows whole. */
async function fits(win, label) {
  checked++
  const wrong = await win.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-quadrant], [data-day]')].filter((one) => one.checkVisibility())
    if (!boxes.length) return ['no boxes found']
    const problems = []
    // Two columns of the Matrix, or any week: the page itself is exactly the window.
    const twoUp = new Set(boxes.map((one) => Math.round(one.getBoundingClientRect().left))).size > 1
    const scroller = boxes[0].parentElement.closest('.min-h-0.flex-1.overflow-y-auto')
    if (twoUp && scroller && scroller.scrollHeight > scroller.clientHeight + 1) problems.push(`the page scrolls ${scroller.scrollHeight - scroller.clientHeight}px`)
    const view = scroller?.getBoundingClientRect()
    for (const box of twoUp ? boxes : []) {
      const head = box.querySelector('header')?.getBoundingClientRect()
      if (head && view && (head.top < view.top - 1 || head.bottom > view.bottom + 1)) problems.push(`a title is cut off (${Math.round(head.top)} to ${Math.round(head.bottom)} in ${Math.round(view.top)} to ${Math.round(view.bottom)})`)
    }
    return problems
  })
  if (wrong.length) { failures.push(`${label} fit: ${wrong.join(' | ')}`); console.log(`FAIL ${label} fit\n     ${wrong.join('\n     ')}`) }
}

async function walk(c, state) {
  const { h, page, electron } = c
  const boxSize = (w, hh) => electron.evaluate(({ BrowserWindow }, [w, hh]) => {
    const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=') && !one.webContents.getURL().includes('note=') && !one.webContents.getURL().includes('sticky'))
    win?.setBounds({ width: w, height: hh })
  }, [w, hh])
  for (const theme of THEMES) {
    await c.theme(theme)
    await page.evaluate((n) => localStorage.setItem('theme', n), theme)
    await page.reload()
    await page.waitForTimeout(1200)
    for (const [w, hh] of SIZES) {
      await c.size(w, hh)
      const tag = `${state}-${theme}-${w}x${hh}`
      for (const id of VIEWS) {
        await c.go(id)
        await check(h, `${tag} ${id}`)
        if (id === 'matrix' || id === 'week') await fits(h, `${tag} ${id}`)
        if (theme === 'dark' && w === SIZES[0][0] && /matrix|week|nuggets|today|inbox/.test(id)) await shot(h, `${tag}-${id}`)
      }
      // Quick capture's side panel, each tab (⌃1 to ⌃5), and Saved's three lists.
      await boxSize(1080, hh)
      await page.waitForTimeout(400)
      for (const [n, tab] of ['inbox', 'tasks', 'review', 'saved', 'recent'].entries()) {
        await page.keyboard.press(`Control+${n + 1}`)
        await page.waitForTimeout(700)
        if (tab === 'saved') {
          for (const chip of ['Gems', 'Writing', 'Questions']) {
            await page.getByRole('button', { name: chip, exact: true }).first().click({ timeout: 2000 }).catch(() => {})
            await page.waitForTimeout(600)
            await check(page, `${tag} box ${tab}/${chip}`)
            if (w === SIZES[0][0] && chip === 'Gems') await shot(page, `${tag}-box-gems`)
          }
        } else await check(page, `${tag} box ${tab}`)
      }
      await page.keyboard.press('Control+1')
    }
  }
  // A note in a window of its own, and a sticky.
  const notes = await h.evaluate(() => window.api.captures.list())
  const note = notes.find((one) => one.status === 'open' && !one.private)
  if (note) {
    await c.send('capture', note.id)
    await h.waitForTimeout(1200)
    await h.keyboard.press('Meta+o')
    let win
    for (let i = 0; i < 40 && !win; i++) { win = electron.windows().find((one) => one.url().includes('note=')); if (!win) await h.waitForTimeout(150) }
    if (win) { await win.waitForTimeout(1200); await check(win, `${state} note window`); await shot(win, `${state}-note-window`); await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('note='))?.close()) }
    else console.log(`(no note window opened in ${state})`)
    await h.evaluate((id) => window.api.stick('capture', id, true), note.id)
    let sticky
    for (let i = 0; i < 40 && !sticky; i++) { sticky = electron.windows().find((one) => one.url().includes('sticky')); if (!sticky) await h.waitForTimeout(150) }
    if (sticky) { await sticky.waitForTimeout(1200); await check(sticky, `${state} sticky`); await shot(sticky, `${state}-sticky`); await h.evaluate((id) => window.api.stick('capture', id, false), note.id) }
    else console.log(`(no sticky opened in ${state})`)
  }
}

async function run(state, args) {
  const data = mkdtempSync(join(tmpdir(), 'mindflow-scroll-'))
  process.env.QA_DATA = data
  process.env.QA_ARGS = args
  const c = await sandbox({ width: SIZES[0][0], height: SIZES[0][1], seeded: args.includes('--sandbox') })
  try {
    // A fresh install opens on the welcome: past it, to the pages themselves.
    if (state === 'empty') {
      await c.h.waitForTimeout(2500)
      const skip = c.h.getByRole('button', { name: /Skip the welcome/ })
      if (await skip.count()) {
        await skip.click()
        await c.h.waitForTimeout(1200)
        await c.h.getByRole('button', { name: /Close, without the tour/ }).click().catch(() => {})
        await c.h.waitForTimeout(1200)
      }
    }
    if (state === 'full') {
      // Many of each, so every list runs well past its fold.
      await c.h.evaluate(async () => {
        const v = window.api.vigil
        for (let i = 0; i < 30; i++) await v('task:add', `Check the shelf number ${i + 1}`, null, i % 2 === 0)
        for (let i = 0; i < 24; i++) {
          const id = await window.api.captures.create({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `A thought worth keeping, number ${i + 1}` }] }] } })
          if (i % 2) await v('nugget:from', `A line to come back to, number ${i + 1}`, { captureId: id })
        }
      })
      await c.h.waitForTimeout(800)
    }
    await walk(c, state)
  } finally {
    await c.close()
    rmSync(data, { recursive: true, force: true })
  }
}

const only = process.env.STATES?.split(',')
for (const [state, args] of [['empty', ''], ['some', '--sandbox'], ['full', '--sandbox']]) {
  if (only && !only.includes(state)) continue
  await run(state, args)
}
console.log(`\n${checked - failures.length}/${checked} surfaces scroll only when they must`)
process.exit(failures.length ? 1 : 0)
