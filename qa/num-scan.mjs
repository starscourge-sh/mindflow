// Every number a person reads is grouped (1,204, never 1204): seeds a big book (5,000 tasks, 5,000 captures,
// 5,000 notes on one tag, 12,000 notes, 1,500 cards to review), walks every main view and fails on any visible run of 4+
// digits without a separator, except years, times and page-like ranges. The seeded titles ("Big task 5000") are words a person typed, kept as typed, so they are left out. SHOTS=<folder> keeps a picture of each view.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/num-scan.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { BIG, seedBig, seeded } from './big-book.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is needed: the big book is written into it between two runs')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
Object.assign(BIG, { tasks: 5000, captures: 5000, inbox: 2000, tagged: 5000 })
if (!seeded(DATA)) await seedBig(DATA)
const c = await sandbox({ width: 1400, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const view of ['review', 'stats', 'home', 'inbox', 'writing', 'nuggets', 'questions', 'tags', 'media', 'sources', 'feed', 'today', 'week', 'month', 'year', 'tasks', 'calendar', 'goals', 'queue', 'map', 'bin', 'archived', 'settings', 'powers']) {
    await c.go(view); await h.waitForTimeout(1500)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${view}.png` })
    const bad = await h.evaluate(() => {
      const out = []
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node; (node = walk.nextNode());) {
        const el = node.parentElement; if (!el || !el.offsetParent || el.closest('[contenteditable=true],input,textarea,code,pre')) continue
        for (const m of node.textContent.replace(/Big (task|note|gem|draft|writing) \d+/g, "").matchAll(/(?<![\d,.:\/-])\d{4,}(?![\d,.:\/-])/g)) if (!/^1[0-9]\d\d$|^20\d\d$/.test(m[0])) out.push(`${m[0]} in "${node.textContent.trim().slice(0, 60)}"`)
      }
      // A tip or a label read aloud says its number too.
      for (const el of document.querySelectorAll('[aria-label],[title]')) for (const said of [el.getAttribute('aria-label'), el.getAttribute('title')]) if (said) for (const m of said.replace(/Big (task|note|gem|draft|writing) \d+/g, "").matchAll(/(?<![\d,.:\/-])\d{4,}(?![\d,.:\/-])/g)) if (!/^1[0-9]\d\d$|^20\d\d$/.test(m[0])) out.push(`${m[0]} in label "${said.slice(0, 60)}"`)
      return out
    })
    check(`${view}: every big number is grouped`, bad.length === 0, bad.slice(0, 5).join(' | '))
  }
} catch (error) { check('the run finished', false, error.message.split('\n')[0]) } finally { await c.close?.() }
done()
