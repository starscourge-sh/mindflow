// The 3,100-block note used by the long-note probes: 2,819 paragraphs, 141
// code blocks, 71 headings, 57 link cards, 8-level lists, two 30x10 tables,
// 239 links to notes that do not exist, and right-to-left, CJK and emoji lines.
import { readFileSync } from 'node:fs'

export const pic = 'data:image/jpeg;base64,' + readFileSync(new URL('./fixtures/long-note-pic.jpg', import.meta.url)).toString('base64')
export const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
export const p = (...parts) => ({ type: 'paragraph', content: parts.filter(Boolean).map((x) => typeof x === 'string' ? t(x) : x) })
export const code = (i) => ({ type: 'codeBlock', attrs: { language: ['js', 'python', 'bash', 'typescript', null][i % 5] }, content: [t(`// block ${i}\nfunction longFunctionNameThatGoesOnAndOn_${i}(argumentNumberOne, argumentNumberTwo, argumentNumberThree) { return argumentNumberOne + argumentNumberTwo + argumentNumberThree + ${'x'.repeat(120)} }\nconst y${i} = ${i}`)] })
export const card = (i) => ({ type: 'bookmark', attrs: { href: `https://www.example-very-long-domain-name-for-testing-purposes.org/articles/2026/11/${'a-very-long-slug-'.repeat(6)}${i}`, title: i % 3 ? `A link card title that is rather long and goes on to describe the whole article in detail number ${i} with more words` : '', description: 'A description of the page that runs to two or three lines in the card when there is room for it, which there may not be.'.repeat(i % 2 + 1), image: i % 4 === 0 ? pic : '', site: 'example-very-long-domain-name-for-testing-purposes.org' } })
const cell = (type, txt) => ({ type, content: [p(txt)] })
export const table = (r, c) => ({ type: 'table', content: Array.from({ length: r }, (_, i) => ({ type: 'tableRow', content: Array.from({ length: c }, (_, j) => cell(i === 0 ? 'tableHeader' : 'tableCell', i === 0 ? `Column heading ${j + 1}` : (j === 3 ? 'Supercalifragilisticexpialidociousantidisestablishmentarianism' : `r${i}c${j} ${'word '.repeat((i + j) % 4)}`))) })) })
const nested = (depth, i) => ({ type: 'bulletList', content: [{ type: 'listItem', content: [p(`Level ${9 - depth} item ${i}: a list item with enough words to wrap when it is indented this deep into the page`), ...(depth > 1 ? [nested(depth - 1, i)] : [])] }, { type: 'listItem', content: [p(`Sibling at level ${9 - depth}`)] }] })
export const link = (n) => ({ type: 'noteLink', attrs: { id: `missing-${n}`, label: `A note that does not exist number ${n}` } })
const LONGWORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4)
const URL_ = 'https://en.wikipedia.org/wiki/Special:Search?search=' + 'the_history_of_the_astrolabe_in_medieval_islamic_astronomy_and_its_transmission_to_europe'.repeat(2)
const SAMPLES = [
  'Kepler threw out the circle after six years of numbers, and Mars finally fit the ellipse.',
  'عندما ننظر إلى السماء في الليل نرى النجوم التي سافر ضوؤها آلاف السنين لكي يصل إلينا.',
  'שמיים זרועי כוכבים מעל המדבר, והאור הישן מגיע אלינו רק עכשיו.',
  '天文学の歴史は古代バビロニアにまで遡り、星の動きを記録した粘土板が残っている。中国古代天文学家也记录了彗星。',
  'Emoji run: 🌌🔭🪐✨👩🏽‍🔬👨‍👩‍👧‍👦🏳️‍🌈🇿🇦 and a mixed line with العربية inside English and 漢字 too.',
]
export function bigDoc() {
  const c = [p('The long notebook: astronomy, maths and everything else kept over three years')]
  let n = 0
  for (let i = 0; c.length < 3100; i++) {
    if (i % 22 === 5) c.push(code(n++))
    else if (i % 50 === 7) c.push(card(i))
    else if (i === 400 || i === 2400) c.push(table(30, 10))
    else if (i % 300 === 150) c.push(nested(8, i))
    else if (i % 97 === 11) c.push(p(`Long word ${LONGWORD} then more.`))
    else if (i % 89 === 13) c.push(p('See ', t(URL_, [{ type: 'link', attrs: { href: URL_ } }]), ' for the rest.'))
    else if (i % 41 === 3) c.push({ type: 'heading', attrs: { level: 2 }, content: [t(`Section ${i}: ${SAMPLES[i % 5].slice(0, 40)}`)] })
    else if (i % 13 === 0) c.push(p(`Linked to `, link(i), ` and #tag${i % 40} #astronomy`))
    else c.push(p(`${i}. ${SAMPLES[i % 5]}`))
  }
  return { type: 'doc', content: c }
}

// Open a note and time it until the editor holds at least `min` blocks and a frame has drawn.
export async function openTimed(c, id, min = 1) {
  const ED = '[data-open] .ProseMirror'
  await c.h.evaluate(([ED, min]) => { window.__open = null; const t0 = performance.now(); const tick = () => { const el = document.querySelector(ED); if (el && el.childElementCount >= min) { requestAnimationFrame(() => { window.__open = performance.now() - t0 }); return } if (performance.now() - t0 < 60000) requestAnimationFrame(tick) }; tick() }, [ED, min])
  await c.send('article', id)
  for (let i = 0; i < 600; i++) { const ms = await c.h.evaluate(() => window.__open); if (ms != null) return Math.round(ms); await c.h.waitForTimeout(100) }
  return null
}

// A CPU profile's costliest functions, by their own time.
export function topCosts(profile, n = 12) {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]))
  const counts = new Map()
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
  const self = new Map()
  for (const [id, us] of counts) { const cf = byId.get(id).callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`; self.set(key, (self.get(key) ?? 0) + us) }
  return [...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`)
}
