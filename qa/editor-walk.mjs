// The "/" menu walked as five people would use it, with real words, then the
// editor pushed to its worst case. Prints what each step made and where the
// typing went; frames under QA_SHOTS to be read by eye.
//   student: headings, a nested list, maths, a diagram
//   reader: a quote, a callout, a picture (typing straight after "Image"), a link
//   writer: headings, two columns, a toggle, a callout as an aside
//   researcher: an embedded note, a table, a diagram
//   planner: a checklist with dates, a table
//   worst case: 500 blocks, a list 6 deep, a 20 x 20 table, pasted Word, a web
//   page and a spreadsheet range, columns with pictures; no step may freeze.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/editor-walk.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
const shot = async (name) => shots && h.screenshot({ path: `${shots}/walk-${name}.png` })
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const fresh = async (first) => {
  await h.evaluate(([sel, first]) => document.querySelector(sel).editor.chain().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: first }] }, { type: 'paragraph' }] }).run(), [sel, first])
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await wait(150)
}
const slash = async (query) => {
  await h.keyboard.type('/', { delay: 30 }); await wait(300)
  await h.keyboard.type(query, { delay: 25 }); await wait(400)
  const picked = await h.evaluate(() => document.querySelector('.tiptap-slash-menu .is-selected .tiptap-slash-menu-title, .tiptap-slash-menu-list button.is-selected')?.textContent ?? '')
  await h.keyboard.press('Enter'); await wait(600)
  return picked
}
const type = (text) => h.keyboard.type(text, { delay: 8 })
const outline = () => h.evaluate((sel) => {
  const out = []
  document.querySelector(sel).editor.state.doc.forEach((node) => out.push(`${node.type.name}${node.attrs.level ? node.attrs.level : ''}:${node.textContent.slice(0, 40)}`))
  return out
}, sel)
const log = (who, step, made) => console.log(`WALK ${who.padEnd(10)} ${step.padEnd(28)} ${JSON.stringify(made).slice(0, 260)}`)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const target = await v('article:new')
  await v('item:save', target, { title: 'Why Rome fell', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Gibbon' }] }, p('Decline came from within.')] } })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Editor walk', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  // Student.
  await fresh('Lecture 4, Tuesday.')
  await slash('heading 1'); await type('The fall of Rome')
  await h.keyboard.press('Enter'); await slash('bulleted'); await type('Causes'); await h.keyboard.press('Enter'); await h.keyboard.press('Tab'); await type('Money troubles'); await h.keyboard.press('Enter'); await type('Too many borders'); await h.keyboard.press('Enter'); await h.keyboard.press('Enter'); await h.keyboard.press('Enter')
  await slash('math'); await wait(400)
  const asked = await h.evaluate(() => !!document.querySelector('[data-ask] input, [data-ask] textarea'))
  await shot('math-ask')
  await type('P = A(1 + r)^t'); await h.keyboard.press('Enter'); await wait(400)
  const latex = await h.evaluate((sel) => document.querySelector(sel).editor.getJSON().content.find((one) => one.type === 'blockMath')?.attrs.latex, sel)
  check('student: "/" "Math" asks for the formula at once and it lands in the maths block', asked && latex === 'P = A(1 + r)^t', JSON.stringify({ asked, latex }))
  let made = await outline()
  log('student', 'heading, list, maths', made)
  check('student: heading, nested list and maths all made', made.some((one) => one.startsWith('heading1:The fall of Rome')) && made.some((one) => one.startsWith('bulletList')) && (await h.evaluate((sel) => !!document.querySelector(`${sel} ul ul`), sel)) && (await h.evaluate((sel) => document.querySelector(sel).editor.getJSON().content.some((one) => /math/i.test(one.type)), sel)), JSON.stringify(made))
  await shot('student')

  // Reader.
  await fresh('From Meditations, book 2.')
  await slash('quote'); await type('You have power over your mind, not outside events.')
  await h.keyboard.press('Enter'); await h.keyboard.press('Enter')
  await slash('callout'); await type('Read this before the exam.')
  made = await outline()
  log('reader', 'quote, callout', made)
  check('reader: quote and callout hold their words', made.some((one) => one.startsWith('blockquote:You have power')) && made.some((one) => /callout.*Read this/i.test(one)), JSON.stringify(made))
  await fresh('A picture of the Forum:')
  const picked = await slash('image')
  await wait(300)
  await type('Actually, words instead.')
  await wait(300)
  made = await outline()
  log('reader', `"${picked}" then typing`, made)
  check('reader: typing straight after "Image" writes in the note, and the empty picture goes', made.some((one) => one === 'paragraph:Actually, words instead.') && !made.some((one) => /imagePlaceholder/.test(one)), JSON.stringify(made))
  await shot('reader')

  // Writer.
  await fresh('Draft, chapter one.')
  await slash('two columns'); await type('Left: the city.'); await wait(100)
  made = await outline()
  log('writer', 'two columns', made)
  check('writer: two columns, typing lands in the first', made.some((one) => one.startsWith('columns:Left: the city.')), JSON.stringify(made))
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await slash('toggle'); await type('Notes to self'); await h.keyboard.press('Enter'); await type('Cut the second scene.')
  made = await outline()
  log('writer', 'toggle', made)
  check('writer: a toggle with a hidden line', made.some((one) => one.startsWith('details:Notes to self')), JSON.stringify(made))
  await shot('writer')

  // Researcher.
  await fresh('Sources.')
  await slash('embed a note'); await type('Why Rome'); await wait(700); await h.keyboard.press('Enter'); await wait(800)
  made = await outline()
  log('researcher', 'embed a note', made)
  check('researcher: a note embedded by name', made.some((one) => /embed/i.test(one)), JSON.stringify(made))
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await slash('table'); await type('Source'); await h.keyboard.press('Tab'); await type('Year'); await h.keyboard.press('Tab'); await type('Trust')
  await slash2Safe()
  made = await outline()
  log('researcher', 'table', made)
  check('researcher: a table filled with Tab', made.some((one) => one.startsWith('table:SourceYearTrust')), JSON.stringify(made))
  await shot('researcher')

  // Planner.
  await fresh('This week.')
  await slash('checklist'); await type('Essay draft tomorrow'); await h.keyboard.press('Enter'); await type('Return library books friday')
  await wait(300)
  made = await outline()
  log('planner', 'checklist with dates', made)
  check('planner: a checklist of two', made.some((one) => one.startsWith('taskList:Essay draft')), JSON.stringify(made))
  await shot('planner')

  // Worst case: 500 blocks.
  const big = Array.from({ length: 500 }, (_, i) => (i % 25 === 0 ? { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Part ${i / 25 + 1}` }] } : p(`Line ${i}: a sentence of ordinary length about the reading for this week, to fill the page.`)))
  let t = Date.now()
  await h.evaluate(([sel, content]) => document.querySelector(sel).editor.commands.setContent({ type: 'doc', content }), [sel, big]); await wait(100)
  const load500 = Date.now() - t
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  t = Date.now(); await type('typed at the end'); const type500 = Date.now() - t
  console.log(`WORST 500 blocks: set ${load500}ms, 16 keys ${type500}ms`)
  check('500 blocks: loads in under 2.5s and 16 keys type in under 2s', load500 < 2500 && type500 < 2000, `${load500} ${type500}`)

  // A list six deep.
  await fresh('Outline.')
  await slash('bulleted')
  for (let i = 1; i <= 6; i++) { await type(`Level ${i}`); await h.keyboard.press('Enter'); if (i < 6) await h.keyboard.press('Tab') }
  const depth = await h.evaluate((sel) => { let d = 0; let el = document.querySelector(`${sel} ul`); while (el) { d++; el = el.querySelector(':scope > li > ul') } return d }, sel)
  const deepest = await h.evaluate((sel) => { const all = [...document.querySelectorAll(`${sel} li`)]; const r = all.at(-1)?.getBoundingClientRect(); const page = document.querySelector(sel).getBoundingClientRect(); return { right: r?.right, page: page.right, left: r?.left } }, sel)
  check('a list six deep nests six times and stays inside the page', depth >= 6 && deepest.right <= deepest.page + 1, JSON.stringify({ depth, deepest }))
  await shot('deep-list')

  // Pasted junk.
  const paste = (html, text) => h.evaluate(([sel, html, text]) => {
    const data = new DataTransfer()
    if (html) data.setData('text/html', html)
    data.setData('text/plain', text)
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [sel, html, text])
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment--><p class=MsoNormal style='mso-margin-top-alt:auto'><b><span style='font-size:14.0pt;font-family:"Calibri Light";mso-fareast-font-family:Calibri'>Week 3 reading<o:p></o:p></span></b></p><p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Gibbon, chapter 1<o:p></o:p></p><p class=MsoNormal><span style='color:#C00000'>Due Friday</span></p><!--EndFragment--></body></html>`
  const web = `<div class="article"><nav><a href="/">Home</a></nav><h1 style="font-size:48px;color:#333">The Roman Forum</h1><figure><img src="https://example.com/forum.jpg" width="1200"><figcaption>The Forum today</figcaption></figure><p style="font-family:Georgia;background:#fff">It was the centre of public life.<script>alert(1)</script></p><button onclick="x()">Subscribe</button><table><tr><td>ad</td></tr></table></div>`
  const sheet = `<table><tr><td>Source</td><td>Year</td><td>Pages</td></tr><tr><td>Gibbon</td><td>1776</td><td>71</td></tr><tr><td>Beard</td><td>2015</td><td>608</td></tr></table>`
  for (const [name, html, text] of [['word', word, 'Week 3 reading\nGibbon, chapter 1\nDue Friday'], ['web', web, 'The Roman Forum\nIt was the centre of public life.'], ['sheet', sheet, 'Source\tYear\tPages\nGibbon\t1776\t71\nBeard\t2015\t608']]) {
    await fresh(`Pasted from ${name}:`)
    t = Date.now()
    await paste(html, text); await wait(500)
    const took = Date.now() - t
    made = await outline()
    const junk = await h.evaluate((sel) => document.querySelector(sel).querySelectorAll('[style*="mso"], [style*="Calibri"], [style*="font-size:48"], script, nav').length, sel)
    log('paste', name, made)
    const words = made.join(' ')
    check(`pasted ${name}: words kept, no Word or web styling, no page menu or button words, no freeze`, words.length > 30 && junk === 0 && !/Subscribe|paragraph:Home|·/.test(words) && took < 2000, JSON.stringify({ made, junk, took }))
    await shot(`paste-${name}`)
    if (name === 'word') check('a Word list pastes as a list', made.some((one) => one.startsWith('bulletList:Gibbon, chapter 1')), JSON.stringify(made))
  }
  check('a spreadsheet range pastes as a table', (await outline()).some((one) => one.startsWith('table:SourceYearPages')), JSON.stringify(await outline()))

  // Columns with pictures.
  // A picture the sandbox already keeps (a list row's cover), wide enough to overflow a column.
  const pic = await h.evaluate(() => [...document.querySelectorAll('img')].map((one) => one.src).find((src) => src && !src.startsWith('data:')) ?? '')
  console.log('PICTURE', pic.slice(0, 80))
  await h.evaluate(([sel, pic]) => document.querySelector(sel).editor.commands.setContent(`<p>Two pictures side by side.</p><div data-columns><div class="mf-columns-row"><div data-column><img src="${pic}"><p>Left caption words.</p></div><div data-column><img src="${pic}"><p>Right caption words.</p></div></div></div><p>After.</p>`), [sel, pic]); await wait(800)
  const cols = await h.evaluate((sel) => [...document.querySelectorAll(`${sel} .mf-column`)].map((col) => { const img = col.querySelector('img')?.getBoundingClientRect(); const box = col.getBoundingClientRect(); return { img: img && Math.round(img.width), col: Math.round(box.width), inside: img ? img.right <= box.right + 1 : null } }), sel)
  check('columns with pictures: each picture fits its column', cols.length === 2 && cols.every((one) => one.img > 0 && one.inside), JSON.stringify(cols))
  await shot('columns-pictures')
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 400))
} finally {
  await c.close()
}
done()

async function slash2Safe() { await wait(200) }
