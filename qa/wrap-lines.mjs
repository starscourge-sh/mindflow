// Wrapped's lines written on this Mac (main/wrap-lines.ts): someone opens this month's wrap, turns every card, closes it
// and opens it again. With the Mac's model stood in (HALIGTREE_QA_CAPS=ai), pages say the stand-in's lines, every number
// in them one of that page's facts, the stand-in's line with a number it was never given is dropped (that page keeps its
// own sentence), and the second open says the same lines. Without it (HALIGTREE_QA_CAPS=macos26), every page says its own.
//   QA_ARGS=--sandbox QA_DATA=<copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 HALIGTREE_QA_CAPS=ai SHOTS=/abs/dir node qa/wrap-lines.mjs
//   (and again with HALIGTREE_QA_CAPS=macos26 on a fresh copy)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const ai = process.env.HALIGTREE_QA_CAPS === 'ai'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const month = `month:${new Date().toISOString().slice(0, 7)}`
const numbers = (text) => [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((one) => String(Number(one[0].replace(/,(?=\d{3}\b)/g, ''))))

// Opens the month's wrap and turns every card, reading each card's line: what it says, and whether it was written.
const walk = async () => {
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: id })), month)
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  const seen = {}
  for (let i = 0; i < 14; i++) {
    await wait(i ? 2600 : 3200)
    const card = await h.$eval('[data-wrap-card]', (el) => el.getAttribute('data-wrap-card'))
    seen[card] = await h.$eval('[data-wrap-card]', (el) => {
      const line = el.querySelector('[data-wrap-line]')
      return { written: line?.getAttribute('data-wrap-line') === 'written', words: (line ?? el).innerText.replace(/\s+/g, ' ').trim() }
    })
    if (card === 'report') break
    await h.keyboard.press('ArrowRight')
  }
  await h.keyboard.press('Escape')
  await wait(600)
  return seen
}

try {
  const first = await walk()
  const written = Object.entries(first).filter(([, one]) => one.written)
  if (ai) {
    // A later open of the same month: the stand-in's lines were written while the first open's cards turned.
    const second = await walk()
    check('pages say the lines written on this Mac (the stand-in\'s)', written.length >= 2 && written.every(([, one]) => one.words.includes("in a stand-in's words")), JSON.stringify(first).slice(0, 600))
    check('the line with a number it was never given is not shown: the first card keeps its own sentence', !JSON.stringify(first).includes('98765') && !JSON.stringify(second).includes('98765'), JSON.stringify(first.intro ?? {}))
    const kept = JSON.parse(readFileSync(join(await electron.evaluate(({ app }) => app.getPath('userData')), 'wrap-lines.json'), 'utf8'))[month]
    const facts = Object.fromEntries(JSON.parse(kept.facts).map((one) => [one.page, new Set(numbers([...one.facts, one.above ?? ''].join(' ')))]))
    const off = Object.entries(kept.lines).filter(([page, line]) => !numbers(line).every((n) => facts[page]?.has(n)))
    check('every number in every kept line is one of its page\'s facts', Object.keys(kept.lines).length >= 2 && !off.length, JSON.stringify(off))
    const again = Object.entries(second).filter(([card, one]) => one.written && first[card]?.written)
    check('opened again, the same pages say the same lines', again.length >= 2 && again.every(([card, one]) => one.words === first[card].words), JSON.stringify(again).slice(0, 400))
  } else {
    check('without Apple Intelligence every page says its own sentence', Object.keys(first).length >= 3 && !written.length && !JSON.stringify(first).includes('stand-in'), JSON.stringify(first).slice(0, 600))
  }
  // Frames: two pages, light and dark, each with its line in.
  if (process.env.SHOTS) {
    await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world: 'files' } })), month)
    for (let i = 0, shot = 0; i < 12 && shot < 2; i++) {
      await wait(2600)
      const card = await h.$eval('[data-wrap-card]', (el) => el.getAttribute('data-wrap-card'))
      if (['tags', 'focus', 'run', 'busiest', 'pictures', 'hours'].includes(card)) {
        shot++
        for (const theme of ['light', 'dark']) {
          await c.look(theme)
          await wait(700)
          await h.screenshot({ path: `${process.env.SHOTS}/wrap-lines-${ai ? 'ai' : 'own'}-${card}-${theme}.png` })
        }
      }
      await h.keyboard.press('ArrowRight')
    }
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
