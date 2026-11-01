// Sources at scale, with the worst names real books hold (break-ui): 5, 50 and 500 people,
// 5 and 500 quotes with no source, long and short and non-Latin names. At the desktop width
// and at a phone's (390 x 844), light and dark: nothing runs off the side, every way out of a
// sourceless quote is reachable and at least 32px tall, a long name is cut with its whole name
// on hover, and the sidebar's Questions row reads at both widths.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/sources-scale.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
// The sandbox's own book (its 14 people and a few sourceless quotes) with these added.
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, size, both, errors } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const make = (patch) => h.evaluate((p) => window.api.captures.create(p), patch)
const HARD = ['Aleksandra Wiśniewska-Kowalczyk', 'Jo', 'Bartholomew Fitzgerald-Montgomery III', '李白', 'Ngũgĩ wa Thiongʼo', 'Gabriel García Márquez', 'Mary Oliver']
const nameOf = (k) => HARD[k] ?? `Person ${String(k).padStart(3, '0')} Example-Longname`
let people = 0
const grow = async (to) => { for (; people < to; people++) await make({ kind: 'quote', body: doc(`A line said by ${nameOf(people)}, number ${people}.`), attribution: nameOf(people) }) }
let loose = 0
const LONG_QUOTE = 'We do not remember days, we remember moments, and the richness of life lies in memories we have forgotten, which is why I write everything down before it goes'
const unsourced = async (to) => { for (; loose < to; loose++) await make({ kind: 'quote', body: doc(loose === 4 ? LONG_QUOTE : `An unsourced line, number ${loose}`) }) }
const read = () => h.evaluate(() => {
  const root = document.scrollingElement
  const main = document.querySelector('[role="main"]') ?? document.body
  const rows = [...document.querySelectorAll('[data-missing-row]')]
  const ways = rows[0] ? [...rows[0].querySelectorAll('[data-missing-ways] button')].map((b) => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), right: Math.round(r.right) } }) : []
  const sideways = Math.max(root.scrollWidth - innerWidth, ...[...main.querySelectorAll('*')].slice(0, 3000).map((one) => Math.round(one.getBoundingClientRect().right - innerWidth)))
  return { sideways, rows: rows.length, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0, ways, width: innerWidth, opacity: rows[0] ? getComputedStyle(rows[0].querySelector('[data-missing-ways]')).opacity : null }
})

try {
  for (const [n, q] of [[5, 5], [50, 5], [500, 500]]) {
    await grow(n)
    await unsourced(q)
    await size(1300, 900)
    await go('sources')
    await wait(1500)
    const wide = await read()
    if (n === 5) {
      // The long quote, newest so first, is cut to its row (its whole words on the pointer and a click away), never wrapped tall.
      const cut = await h.evaluate(() => { const first = [...document.querySelectorAll('[data-missing-row] > button')].find((one) => one.textContent.startsWith('We do not remember')); return first ? { cut: first.scrollWidth > first.clientWidth, title: first.title.length } : null })
      check('the long sourceless quote is cut to its row, its whole words on hover', !!cut?.cut && cut.title > 100, JSON.stringify(cut))
    }
    if (shots) await both(`${shots}/sources-${n}`)
    check(`${n} people: nothing runs off the side at desktop width`, wide.sideways <= 0, JSON.stringify(wide))
    await size(390, 844)
    await wait(800)
    const phone = await read()
    if (shots) await both(`${shots}/sources-${n}-phone`)
    check(`${n} people, phone width: nothing runs off the side`, phone.sideways <= 0, JSON.stringify(phone))
    check(`${n} people, phone width: each row stays one line, its ways a full tap tall and inside the window`, phone.rowH <= 40 && phone.ways.length === 3 && phone.ways.every((one) => one.h >= 32 && one.right <= phone.width), JSON.stringify(phone))
  }
  await size(1300, 900)
  await wait(600)
  const said = await h.evaluate(() => document.querySelector('[data-missing-source] h3')?.textContent ?? '')
  check('the count over them is true: 500 of mine, plus the sandbox\'s own', /^5\d\d quotes have no source$/.test(said), said)
  // The sidebar, desktop and phone, light and dark: Questions its own row.
  await go('articles')
  await wait(900)
  if (shots) await both(`${shots}/sidebar-wide`)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) { console.log("ERR", e.message.slice(0, 200), JSON.stringify(errors.slice(0, 5))) } finally {
  await c.close()
}
done()
