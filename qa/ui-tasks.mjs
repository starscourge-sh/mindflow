// The task pages, Home, Settings and the box at the window's smallest
// (560x400), about 900x640, and full-screen sizes (1920x1200, 2560x1440), with
// the sidebar open and closed: no sideways scroll, no row whose details stack
// one per line, no box clipped without a fade, and a sensible width on wide screens.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/ui-tasks.mjs
// SHOTS=<folder> saves a picture of each page at each size; THEME=dark runs it dark.
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { h, page, v, go, size, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const shoot = async (name, target = h) => { if (SHOTS) await target.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {}) }
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (days, hm) => { const d = new Date(); d.setDate(d.getDate() + days); return new Date(`${key(d)}T${hm}:00`).toISOString() }
const add = async (title, patch = {}) => { const made = await v('task:add', title); const id = made?.id ?? made; if (Object.keys(patch).length) await v('task:save', id, patch); return id }

// What a page breaks, read off the page itself.
const audit = () => h.evaluate(() => {
  const main = document.querySelector('main') ?? document.body
  const out = { sideways: document.scrollingElement.scrollWidth > innerWidth + 1 || main.scrollWidth > main.clientWidth + 1, stacked: [], clipped: [], wide: 0 }
  // A details line (the small line under a title) whose bits sit on more than one line.
  for (const el of main.querySelectorAll('[data-meta]')) {
    const tops = new Set([...el.children].filter((k) => k.getBoundingClientRect().height).map((k) => Math.round(k.getBoundingClientRect().top / 4)))
    if (tops.size > 1) out.stacked.push(el.textContent.slice(0, 60))
  }
  // A text box that cuts its words off without saying so (no ellipsis, no clamp, no fade).
  for (const el of main.querySelectorAll('p, span, div, button, a, h1, h2, h3')) {
    if (el.children.length || !el.textContent.trim() || el.classList.contains('sr-only')) continue
    const s = getComputedStyle(el)
    if (s.overflow !== 'hidden' && s.overflowX !== 'hidden') continue
    const cut = el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && !s.webkitLineClamp?.match(/\d/) && !s.maskImage?.includes('gradient') && !s.webkitMaskImage?.includes('gradient')
    const cutDown = el.scrollHeight > el.clientHeight + 4 && s.webkitLineClamp === 'none' && !s.webkitMaskImage?.includes('gradient') && !s.maskImage?.includes('gradient') && el.clientHeight > 0
    if (cut || cutDown) out.clipped.push(`${el.textContent.slice(0, 40)} (${el.className.toString().slice(0, 60)})`)
  }
  // The widest run of text in the page, which on a wide screen should not run edge to edge.
  for (const el of main.querySelectorAll('p, li, [data-row]')) out.wide = Math.max(out.wide, el.getBoundingClientRect().width)
  // Home's cards: never so narrow that a title wraps and is then cut off.
  out.cards = Math.min(...[...main.querySelectorAll('.grid > button, .grid > a, .grid > div')].filter((k) => k.closest('[class*="minmax(min(100%,15rem)"]')).map((k) => k.getBoundingClientRect().width), 9999)
  // The Matrix: a box holding more than shows says how many more, and its title stays in view.
  out.matrix = [...main.querySelectorAll('[data-matrix-list]')].filter((list) => {
    const edge = list.getBoundingClientRect().bottom
    const hidden = [...list.children].filter((one) => one.getBoundingClientRect().top + 12 > edge).length
    const box = list.closest('[data-quadrant]')
    const said = box?.querySelector('[data-more-below]')?.textContent ?? ''
    const title = box?.querySelector('h2')?.getBoundingClientRect()
    const faded = parseFloat(getComputedStyle(list).getPropertyValue('--mf-fade-end')) > 0
    return hidden && (!faded || !said.includes(`+${hidden} more`) || !title || title.top < box.getBoundingClientRect().top)
  }).length
  return out
})

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: false, celebrate: false })
  await v('onboarding:set', { pageHints: false }).catch(() => {})
  const long = 'Email the department about the extension for the Comparative Literature 302 essay on the Romantic sublime'
  await add(long, { due: at(0, '09:00'), estimate: 90, important: 1 })
  await add('Return the library book before the fine doubles again', { due: at(-2, '09:00') })
  await add('Pay the electricity bill', { due: at(-1, '17:00'), estimate: 10 })
  for (let i = 0; i < 12; i++) await add(`Revision block ${i + 1}: go over the lecture notes and past paper questions`, { due: at(i % 3, `${pad(10 + (i % 8))}:00`), estimate: 25 })
  await add('Someday learn to play the cello', { later: true }).catch(() => {})
  await h.reload(); await wait(2500)
  if (process.env.THEME) await c.theme(process.env.THEME)

  // A mode is picked at a width where its chips show, then the window goes back to the size under test.
  let current = [1000, 700]
  const mode = async (label) => { await size(1400, 900); await go('today'); await h.getByRole('button', { name: label, exact: true }).first().click(); await size(...current) }
  const pages = [
    ['home', async () => go('home')],
    ['today-list', async () => mode('List')],
    ['today-page', async () => mode('Page')],
    ['today-matrix', async () => mode('Matrix')],
    ['upcoming', async () => go('upcoming')],
    ['routines', async () => go('routines')],
    ['later', async () => go('later')],
    ['settings', async () => go('settings')]
  ]
  const sizes = [[560, 400], [900, 640], [1920, 1200], [2560, 1440]]
  for (const [w, hh] of sizes) {
    current = [w, hh]
    await size(w, hh)
    const real = await h.evaluate(() => [innerWidth, innerHeight])
    for (const side of ['open', 'closed']) {
      for (const [name, show] of pages) {
        await show(); await wait(700)
        const a = await audit()
        const tag = `${w}x${hh} ${side} ${name}`
        await shoot(`${w}x${hh}-${side}-${name}`)
        check(`${tag}: no sideways scroll`, !a.sideways)
        check(`${tag}: no details stacked one per line`, !a.stacked.length, a.stacked.join(' | '))
        check(`${tag}: nothing cut off without an ellipsis or fade`, !a.clipped.length, a.clipped.slice(0, 4).join(' | '))
        if (name === 'home') check(`${tag}: Home's cards are wide enough for their titles (${Math.round(a.cards)}px)`, a.cards >= 200)
        if (name === 'today-matrix') check(`${tag}: a full Matrix box fades at its foot and says how many more it holds`, !a.matrix)
        if (w >= 1920 && name !== 'today-matrix') check(`${tag}: text keeps a readable width (${Math.round(a.wide)}px of ${real[0]})`, a.wide <= 1100)
      }
      await h.keyboard.press('Meta+b'); await wait(500)
    }
  }

  // The box at its smallest and largest.
  for (const [w, hh] of [[560, 280], [900, 760]]) {
    await electron.evaluate(({ BrowserWindow }, [w, hh]) => { const win = BrowserWindow.getAllWindows().find((one) => !/[?&]view=/.test(one.webContents.getURL())); win?.setBounds({ width: w, height: hh }) }, [w, hh])
    await page.waitForTimeout(600)
    const sideways = await page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1)
    await shoot(`box-${w}x${hh}`, page)
    check(`box ${w}x${hh}: no sideways scroll`, !sideways)
  }
} catch (error) {
  check('ran to the end', false, error.stack)
} finally {
  await c.close()
  done()
}
