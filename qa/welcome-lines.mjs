// The welcome's Write page, for each of the five stories, at 1440 by 900 and 1100 by 720, light and dark: the lines from
// the page to the cards. Each picked phrase (the plain gem, the gem with a question, the task) is marked in place, and its
// line leaves from the page card's right edge, level with that phrase's last line of words, then curves to its card: no
// line runs through or under the paragraph, and the lines never cross (a phrase higher in the page goes to a higher card).
// Every card and the closing line fit above the footer. Played still (Reduce motion), so it is whole at once.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-lines.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { STORIES } from '../src/renderer/src/lib/welcome-stories.ts'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
const next = async (h) => ((await h.$('footer button:has-text("Skip trying it")')) ? h.click('footer button:has-text("Skip trying it")') : h.click('footer button:has-text("Next"), footer button:has-text("Show me")'))
const chapter = (h) => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')

/** Where each line leaves and lands, and how it sits beside the paragraph and its marked words. */
const measure = (h) => h.evaluate(() => {
  const note = document.querySelector('[data-flow="note"]').getBoundingClientRect()
  const para = document.querySelector('[data-flow="note"] p.border-t').getBoundingClientRect()
  const foot = document.querySelector('.mf-welcome footer').getBoundingClientRect().top
  const lines = ['kept', 'gem', 'task'].map((one) => {
    const path = document.querySelector(`[data-link="${one}"]`)
    const mark = document.querySelector(`[data-flow="note"] [data-mark="${one}"]`)
    const card = document.querySelector(`[data-flow="${one}"]`).getBoundingClientRect()
    const svg = path.ownerSVGElement.getBoundingClientRect()
    const length = path.getTotalLength()
    const points = Array.from({ length: 41 }, (_, i) => path.getPointAtLength((length * i) / 40)).map((p) => [svg.left + p.x, svg.top + p.y])
    const rects = [...mark.getClientRects()]
    const last = rects[rects.length - 1]
    return {
      id: one,
      start: points[0],
      end: points[points.length - 1],
      level: (last.top + last.bottom) / 2,
      // Any point of the line over the paragraph's own box: through or under its words.
      over: points.filter(([x, y]) => x < para.right - 1 && y > para.top && y < para.bottom).length,
      card: [card.left, (card.top + card.bottom) / 2]
    }
  })
  const all = [...document.querySelectorAll('[data-flow], [data-flow-last]')].map((el) => el.getBoundingClientRect())
  const words = document.querySelector('.mf-welcome h1').parentElement.getBoundingClientRect().bottom
  return { right: note.right, lines, room: Math.round(foot - Math.max(...all.map((r) => r.bottom))), head: Math.round(Math.min(...all.map((r) => r.top)) - words), fits: all.every((r) => r.right <= innerWidth && r.left >= 0) }
})

for (const theme of ['light', 'dark']) {
  const c = await sandbox({ width: 1440, height: 900, seeded: false })
  const { h } = c
  try {
    await c.theme(theme)
    await h.emulateMedia({ reducedMotion: 'reduce' })
    const done = new Set()
    for (let run = 0; run < 60 && done.size < STORIES.length; run++) {
      // Closed first, so each opening starts from its first page with the story it picks.
      if (await h.$('.mf-welcome footer button:has-text("Skip the welcome")')) (await h.click('.mf-welcome footer button:has-text("Skip the welcome")'), await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 8000 }).catch(() => null))
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
      await h.waitForSelector('.mf-welcome', { timeout: 8000 })
      await h.waitForTimeout(150)
      const id = await h.evaluate(() => document.querySelector('.mf-welcome')?.dataset.story ?? '')
      if (done.has(id)) continue
      done.add(id)
      for (let i = 0; i < 10 && !(await chapter(h)).includes('Write'); i++) (await next(h), await h.waitForTimeout(450))
      for (const [w, hh] of [[1440, 900], [1100, 720]]) {
        await c.size(w, hh)
        await h.waitForTimeout(500)
        const m = await measure(h)
        const S = STORIES.find((one) => one.id === id)
        const page = await h.evaluate(() => document.querySelector('[data-flow="note"]')?.innerText.replace(/\s+/g, ' ') ?? '')
        check(`${theme} ${id} ${w}x${hh}: the page is this story's, title and words`, page.includes(S.note) && page.includes(S.kept) && page.includes(S.words[S.words.length - 1]), page.slice(0, 80))
        const at = `${theme} ${id} ${w}x${hh}`
        check(`${at}: each line leaves from the page's right edge, level with its own marked words`, m.lines.every((one) => Math.abs(one.start[0] - m.right) <= 2 && Math.abs(one.start[1] - one.level) <= 10), m.lines.map((one) => `${one.id} ${Math.round(one.start[0] - m.right)},${Math.round(one.start[1] - one.level)}`).join(' | '))
        check(`${at}: no line runs through or under the paragraph`, m.lines.every((one) => one.over === 0), m.lines.map((one) => `${one.id} ${one.over}`).join(' | '))
        check(`${at}: each line lands on its own card`, m.lines.every((one) => Math.abs(one.end[0] - one.card[0]) <= 2 && Math.abs(one.end[1] - one.card[1]) <= 2))
        const byStart = [...m.lines].sort((a, b) => a.start[1] - b.start[1]).map((one) => one.id).join()
        const byEnd = [...m.lines].sort((a, b) => a.end[1] - b.end[1]).map((one) => one.id).join()
        const apart = [...m.lines].sort((a, b) => a.start[1] - b.start[1]).every((one, i, all) => !i || one.start[1] - all[i - 1].start[1] >= 6)
        check(`${at}: the lines never cross: a phrase higher in the page goes to a higher card`, byStart === byEnd && apart, `${byStart} / ${byEnd}`)
        check(`${at}: the cards and the closing line fit between the page's words and the footer`, m.room >= 0 && m.head >= 0 && m.fits, `${m.head}px under the words, ${m.room}px over the footer`)
        if (SHOTS) await h.screenshot({ path: `${SHOTS}/${theme}-${id}-${w}x${hh}.png` })
      }
      await c.size(1440, 900)
    }
    check(`${theme}: all five stories seen`, done.size === STORIES.length, [...done].join())
  } finally {
    if (c.errors.length) console.log(c.errors.join('\n'))
    await c.close()
  }
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
