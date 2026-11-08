// Mermaid diagrams drawn by Pele: "/" "Diagram" makes one with the caret in
// its words and the drawing under them, the drawing follows typing, Esc steps
// out and hides the words, a click on the drawing brings them back, a mistake
// says so in words, a ```mermaid fence pasted from Obsidian or read from
// Markdown is drawn the same way, Markdown keeps the fence, the drawing takes
// the theme's colours (Paper, Light, Dark), and a note with no diagram never
// loads Pele. Frames under QA_SHOTS.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/diagram.mjs
import { readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const sel = '[data-open] .tiptap'
const shot = async (name) => shots && h.screenshot({ path: `${shots}/diagram-${name}.png` })
const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
// Pele's code (its theme string) is in its own chunk, never in the app's first script.
const assets = join(dirname(process.env.QA_ENTRY), '..', 'renderer', 'assets')
const holding = readdirSync(assets).filter((one) => one.endsWith('.js') && readFileSync(join(assets, one), 'utf8').includes('var(--pele-bg'))
const first = readFileSync(join(assets, '..', 'index.html'), 'utf8').match(/assets\/(index-[^"]+\.js)/)?.[1]
check('Pele is a chunk of its own, loaded only when a diagram is drawn', holding.length > 0 && !holding.includes(first), `${holding.join(',')} first ${first}`)
const state = () => h.evaluate((sel) => {
  const ed = document.querySelector(sel).editor
  const block = document.querySelector(`${sel} .mf-diagram-block`)
  const { $head } = ed.state.selection
  return {
    blocks: document.querySelectorAll(`${sel} .mf-diagram-block`).length,
    inWords: $head.parent.type.name === 'codeBlock' && $head.parent.attrs.language === 'mermaid',
    wordsShown: block ? getComputedStyle(block.querySelector('pre')).display !== 'none' : null,
    svg: !!block?.querySelector('.mf-diagram svg'),
    text: block?.querySelector('.mf-diagram svg')?.textContent ?? '',
    note: block?.querySelector('.mf-diagram-note')?.textContent ?? ''
  }
}, sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Diagram', body: { type: 'doc', content: [p('Start.')] } })
  await c.send('article', id); await wait(1500)

  // 1. "/" Diagram.
  await h.evaluate((sel) => document.querySelector(sel).editor.chain().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'How a question becomes a card:' }] }, { type: 'paragraph' }] }).run(), sel)
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await h.keyboard.type('/', { delay: 30 }); await wait(400)
  await h.keyboard.type('diagram', { delay: 30 }); await wait(500)
  await shot('menu')
  await h.keyboard.press('Enter'); await wait(1200)
  let s = await state()
  check('"/" "Diagram" makes a diagram block', s.blocks === 1, JSON.stringify(s))
  check('with the caret in its words, shown above the drawing', s.inWords && s.wordsShown, JSON.stringify(s))
  check('and the diagram drawn under them', s.svg && /Question/.test(s.text) && /Answer/.test(s.text), JSON.stringify(s))
  await shot('made')

  // 2. The drawing follows typing.
  await h.keyboard.press('Enter'); await h.keyboard.type('  Answer --> Card', { delay: 20 }); await wait(700)
  s = await state()
  check('typing a new line draws the new box', /Card/.test(s.text), s.text)
  await shot('typed')

  // 3. Esc steps out.
  await h.keyboard.press('Escape'); await wait(300)
  s = await state()
  check('Esc leaves the words: the caret is below, the words hidden, the drawing stays', !s.inWords && s.wordsShown === false && s.svg, JSON.stringify(s))
  await h.keyboard.type('After the diagram.', { delay: 15 }); await wait(200)
  const after = await h.evaluate((sel) => document.querySelector(sel).editor.getJSON().content.map((one) => `${one.type}:${(one.content ?? []).map((t) => t.text ?? '').join('')}`), sel)
  check('and typing goes on in the note under it', after[1]?.startsWith('codeBlock') && after[2] === 'paragraph:After the diagram.', JSON.stringify(after))
  await shot('left')

  // 4. Click the drawing to edit.
  const drawing = await h.evaluate((sel) => { const r = document.querySelector(`${sel} .mf-diagram`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, sel)
  await h.mouse.move(drawing.x, drawing.y); await wait(150)
  const cursor = await h.evaluate((sel) => getComputedStyle(document.querySelector(`${sel} .mf-diagram`)).cursor, sel)
  check('the drawing shows the hand', cursor === 'pointer', cursor)
  await h.mouse.click(drawing.x, drawing.y); await wait(300)
  s = await state()
  check('a click on the drawing opens its words with the caret in them', s.inWords && s.wordsShown, JSON.stringify(s))
  await shot('clicked')

  // 5. A mistake says so.
  await h.keyboard.type(' -->', { delay: 20 }); await wait(700)
  s = await state()
  check('a half-written line says it is not drawn yet, in words', /Not drawn yet/.test(s.note), JSON.stringify(s))
  await shot('mistake')
  await h.keyboard.press('Backspace'); await h.keyboard.press('Backspace'); await h.keyboard.press('Backspace'); await h.keyboard.press('Backspace'); await wait(600)
  s = await state()
  check('and the note goes once it is right again', !s.note && s.svg, JSON.stringify(s))
  await h.keyboard.press('Escape'); await wait(200)

  // 6. Markdown keeps the fence.
  const md = await h.evaluate((sel) => document.querySelector(sel).editor.getMarkdown(), sel)
  check('Markdown keeps it as a ```mermaid fence', /```mermaid\nflowchart LR\n {2}Question --> Reading/.test(md), md.slice(0, 200))

  // 7. Markdown in, and a paste from Obsidian.
  const obsidian = '# Lecture 4\n\n```mermaid\nsequenceDiagram\n  Student->>Tutor: Why did Rome fall?\n  Tutor-->>Student: Read Gibbon\n```\n\nNotes after.\n'
  await h.evaluate(([sel, md]) => document.querySelector(sel).editor.commands.setContent(md, { contentType: 'markdown' }), [sel, obsidian]); await wait(1200)
  s = await state()
  check('a ```mermaid fence read from Markdown is drawn', s.blocks === 1 && s.svg && /Gibbon/.test(s.text) && !s.wordsShown, JSON.stringify(s))
  await shot('from-markdown')
  await h.evaluate((sel) => document.querySelector(sel).editor.chain().focus().setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pasted:' }] }, { type: 'paragraph' }] }).focus('end').run(), sel)
  await h.evaluate(([sel, text]) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, [sel, '```mermaid\nflowchart TD\n  Reading --> Gem\n  Gem --> Review\n```\n']); await wait(1200)
  s = await state()
  check('a ```mermaid fence pasted from Obsidian is drawn the same way', s.blocks === 1 && s.svg && /Review/.test(s.text), JSON.stringify(s))
  await shot('pasted')

  // 8. The theme's colours.
  const colours = []
  for (const name of ['paper', 'light', 'dark']) {
    await c.theme(name); await wait(1200)
    const look = await h.evaluate((sel) => {
      const svg = document.querySelector(`${sel} .mf-diagram svg`)
      const shape = svg?.querySelector('rect, path, polygon')
      const text = svg?.querySelector('text')
      const page = getComputedStyle(document.querySelector(sel)).color
      return { fill: shape && getComputedStyle(shape).fill, text: text && getComputedStyle(text).fill, ink: page, font: text && getComputedStyle(text).fontFamily, noteFont: getComputedStyle(document.querySelector(`${sel} p`)).fontFamily }
    }, sel)
    colours.push(look)
    await shot(`theme-${name}`)
  }
  console.log('COLOURS', JSON.stringify(colours))
  check('the words in the drawing are the theme\'s ink in every theme', colours.every((one) => one.text === one.ink), JSON.stringify(colours))
  check('and in the note\'s own typeface', colours.every((one) => one.font === one.noteFont), JSON.stringify(colours.map((one) => [one.font, one.noteFont])))
  check('light and dark draw it differently', colours[1].text !== colours[2].text)
  check('no page errors', !c.errors.some((one) => /PAGEERROR/.test(one)), c.errors.join(' / ').slice(0, 400))
} finally {
  await c.close()
}
done()
