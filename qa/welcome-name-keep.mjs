// Name it, played again over a book that already has a name: "Draw another" only tries a name on.
//  - pressed five times, the book's saved name and its card's line ("Midnight Gleaner") never change
//  - once a drawn name shows, "Back to “<your name>”" is offered under the field; it, or ⌘Z in the field, brings your
//    name and your own card (its line too) back, and the field keeps no drawn name
//  - typing over a drawn name wins: the typed name is what the field holds
//  - Back from the page, after drawing (or typing and drawing), saves nothing
//  - Enter on a drawn name keeps it (the one way a drawn name is saved), with its card
//  Light, then dark. A screenshot of each state.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-name-keep.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const OWN = 'The Chapel of Anticipation'
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const read = (h) => h.evaluate(() => ({
  value: document.querySelector('[data-welcome-book-name]')?.value ?? '',
  card: document.querySelector('.mf-welcome [data-reader-name]')?.textContent ?? '',
  line: document.querySelector('.mf-welcome [data-reader-title]')?.textContent ?? '',
  own: document.querySelector('[data-name-own]')?.textContent ?? ''
}))

for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1280, height: 800, seeded: false })
  const { h } = c
  const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${theme}-${name}.png` })
  const toName = async () => {
    await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
    await h.waitForSelector('.mf-welcome', { timeout: 8000 })
    for (let i = 0; i < 30 && !(await chapter(h)).includes('Name it'); i++) (await next(h), await h.waitForTimeout(450))
    await h.waitForSelector('[data-welcome-book-name]', { timeout: 4000 })
    await h.waitForTimeout(800)
  }
  try {
    await c.look(theme)
    await c.v('books:rename', 'default', OWN)
    await c.v('settings:set', { readerSeed: 12345 })
    await toName()
    const start = await read(h)
    check(`${theme}: the field starts with the book's own name`, start.value === OWN && start.card === OWN, JSON.stringify(start))
    await shot('0-own')
    let kept = true
    let drawnAll = true
    for (let n = 0; n < 5; n++) {
      await h.click('[data-name-draw]')
      await h.waitForTimeout(250)
      const now = await read(h)
      drawnAll &&= now.value !== OWN && now.card === now.value
      const saved = await c.v('books:list')
      kept &&= saved.name === OWN
    }
    check(`${theme}: five presses of “Draw another” show five drawn names`, drawnAll)
    check(`${theme}: and the book's saved name is still its own after every press`, kept, (await c.v('books:list')).name)
    const seed = (await c.v('settings')).readerSeed
    check(`${theme}: the card's saved look is untouched while drawing`, seed === 12345, String(seed))
    // Back from the page after drawing: nothing kept (the user's walk: a drawn name became the book's name).
    await h.click('footer button:has-text("Back")')
    await h.waitForTimeout(900)
    const left = await c.v('books:list')
    check(`${theme}: Back after drawing keeps the book's own name and card`, left.name === OWN && (await c.v('settings')).readerSeed === 12345, left.name)
    await c.v('books:rename', 'default', OWN)
    await c.v('settings:set', { readerSeed: 12345 })
    await toName()
    await h.click('[data-name-draw]')
    await h.waitForTimeout(250)
    const drawn = await read(h)
    check(`${theme}: a way back to your own name is offered under the field`, drawn.own.includes(`Back to “${OWN}”`), drawn.own)
    await shot('1-drawn')
    await h.click('[data-name-own]', { timeout: 1500 }).catch(() => {})
    await h.waitForTimeout(250)
    const back = await read(h)
    check(`${theme}: “Back to” brings your name and your own card's line back`, back.value === OWN && back.card === OWN && back.line === start.line && !back.own, JSON.stringify(back))
    await shot('2-back')
    await h.click('[data-name-draw]')
    await h.waitForTimeout(200)
    await h.focus('[data-welcome-book-name]')
    await h.keyboard.press('Meta+z')
    await h.waitForTimeout(250)
    const undone = await read(h)
    check(`${theme}: ⌘Z in the field brings your name back too`, undone.value === OWN && undone.line === start.line, JSON.stringify(undone))
    await h.click('[data-name-draw]')
    await h.waitForTimeout(200)
    await h.focus('[data-welcome-book-name]')
    await h.keyboard.press('Meta+a')
    await h.keyboard.type('Field Notes', { delay: 10 })
    await h.waitForTimeout(200)
    const typed = await read(h)
    check(`${theme}: typing over a drawn name wins`, typed.value === 'Field Notes' && typed.card === 'Field Notes' && !typed.own, JSON.stringify(typed))
    await h.click('[data-name-draw]')
    await h.waitForTimeout(200)
    const overTyped = await read(h)
    check(`${theme}: drawn over a typed name, the way back is to the typed name`, overTyped.own.includes('Back to “Field Notes”'), overTyped.own)
    await h.click('footer button:has-text("Back")')
    await h.waitForTimeout(900)
    check(`${theme}: Back after typing then drawing keeps the book's own name`, (await c.v('books:list')).name === OWN && (await c.v('settings')).readerSeed === 12345)
    // Enter on a drawn name: the one way it is kept.
    await toName()
    await h.click('[data-name-draw]')
    await h.waitForTimeout(250)
    const chosen = await read(h)
    await h.focus('[data-welcome-book-name]')
    await h.keyboard.press('Enter')
    await h.waitForTimeout(900)
    const after = await c.v('books:list')
    check(`${theme}: Enter on a drawn name keeps it, with its card`, after.name === chosen.value && (await c.v('settings')).readerSeed !== 12345, `${after.name} vs ${chosen.value}`)
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
