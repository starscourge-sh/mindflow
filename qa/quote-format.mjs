// A quote's "- who, where" fills Who and Where, and says so where it can be
// seen without hovering: the chips wear the lit words' pink, their tip names
// the words they came from and the format, typing in one unties it, and in
// the welcome a note beside them says what happened, never over Create.
//
//   npx electron-vite build --outDir out-qf
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-qf/main/index.js MINDFLOW_QA_AWAY=1 node qa/quote-format.mjs [shots-dir]
import { mkdirSync } from 'fs'
import { open, checks } from './harness.mjs'

const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const QUOTE = '“No, Luke, I am your father” - Darth Vader, Empire Strikes Back'
const { check, done } = checks()

const qa = await open()
const { page, electron } = qa
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const wait = (ms = 300) => page.waitForTimeout(ms)
const v = (channel, ...args) => page.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])
const boxSize = (width, height) => electron.evaluate(({ BrowserWindow }, [w, h]) => {
  const win = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view='))
  win.setSize(w, h)
  return win.getSize()
}, [width, height])

/** The box, fresh, in the welcome or not, on a theme. */
async function fresh(welcoming, theme = 'github') {
  await v('onboarding:set', welcoming ? { welcomed: null, welcoming: true } : { welcomed: new Date().toISOString(), welcoming: false })
  await page.evaluate((name) => (localStorage.clear(), localStorage.setItem('theme', name)), theme)
  await page.evaluate(() => window.api.showPrompt())
  await page.reload()
  await page.waitForSelector(EDITOR)
  await wait(1200)
  await page.evaluate(() => (document.documentElement.dataset.solid = ''))
  await page.click(EDITOR)
  await page.evaluate((s) => document.querySelector(s)?.editor?.commands.clearContent(true), EDITOR)
  await page.keyboard.type(QUOTE, { delay: 8 })
  await wait(900)
}

const look = () => page.evaluate(() => {
  const box = (el) => (el ? (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(el.getBoundingClientRect()) : null)
  const over = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  const fields = [...document.querySelectorAll('[data-read-from]')]
  // The lit words' pink, as the tied edge mixes it.
  const pink = (() => {
    const probe = document.createElement('span')
    probe.style.color = 'color-mix(in oklab, var(--tt-color-text-pink) 55%, transparent)'
    document.body.append(probe)
    const said = getComputedStyle(probe).color
    probe.remove()
    return said
  })()
  const note = document.querySelector('[data-read-note]')
  const create = [...document.querySelectorAll('main[data-zen-row] button')].pop()
  const others = [...document.querySelectorAll('input, [data-kind-chip], main button, main label')].filter((one) => one !== note)
  return {
    welcome: document.documentElement.hasAttribute('data-welcome-ph'),
    tied: fields.map((one) => one.value),
    edges: fields.map((one) => getComputedStyle(one).borderTopColor),
    pink,
    lit: document.querySelector(`.box-token[data-box-token="signature"]`)?.textContent ?? '',
    note: note && getComputedStyle(note).display !== 'none' ? note.textContent : '',
    noteOver: note ? others.filter((one) => over(box(note), box(one))).map((one) => one.outerHTML.slice(0, 60)) : [],
    // Its words, not its line's box: they are what must stay in the window.
    noteInside: note ? (() => { const range = document.createRange(); range.selectNodeContents(note); const r = range.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0 })() : true,
    createOver: create ? others.filter((one) => one !== create && !one.contains(create) && !create.contains(one) && over(box(create), box(one))).map((one) => one.outerHTML.slice(0, 60)) : ['no Create']
  }
})
const leansPink = (edge, pink) => edge === pink

// --- in the welcome -------------------------------------------------------------
for (const theme of ['dark', 'paper']) {
  await fresh(true, theme)
  // The box as it opens, the main window's size, and narrow.
  for (const [label, size] of [['640x600', [640, 600]], ['1280x800', [1280, 800]], ['560x400', [560, 400]]]) {
    await boxSize(...size)
    await wait(600)
    const seen = await look()
    check(`${theme} ${label}: in the welcome`, seen.welcome)
    check(`${theme} ${label}: the tail is lit`, seen.lit.includes('Darth Vader'), seen.lit)
    check(`${theme} ${label}: both chips tied`, seen.tied.join('|') === 'Darth Vader|Empire Strikes Back', seen.tied.join('|'))
    check(`${theme} ${label}: chips wear the pink`, seen.edges.length === 2 && seen.edges.every((one) => leansPink(one, seen.pink)), `${seen.edges.join(' ')} vs ${seen.pink}`)
    check(`${theme} ${label}: the note says what happened`, seen.note === '↑ read from “- who, where” after the quote', seen.note)
    check(`${theme} ${label}: the note overlaps nothing`, !seen.noteOver.length && seen.noteInside, seen.noteOver.join(' ; '))
    check(`${theme} ${label}: nothing over Create`, !seen.createOver.length, seen.createOver.join(' ; '))
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/welcome-${theme}-${label}.png` })
  }
  await boxSize(640, 600)
}

// --- the tip, and typing unties ---------------------------------------------------
await page.hover('input[data-read-from]')
await wait(700)
const tip = await page.evaluate(() => document.querySelector('[data-slot="tooltip-content"], [role="tooltip"]')?.textContent ?? '')
check('the tip names the words and the format', tip.includes('Read from “- Darth Vader, Empire Strikes Back”') && tip.includes('Write “- who, where” after a quote'), tip)
if (SHOTS) await page.screenshot({ path: `${SHOTS}/tip-paper.png` })
await page.click('input[data-read-from]')
await page.keyboard.press('End')
await page.keyboard.type('!')
await wait(400)
let seen = await look()
check('typing in Who unties it, Where stays tied', seen.tied.join('|') === 'Empire Strikes Back', seen.tied.join('|'))

// --- every day, outside the welcome -----------------------------------------------
await fresh(false, 'dark')
seen = await look()
check('everyday: not in the welcome', !seen.welcome)
check('everyday: chips tied and pink', seen.tied.length === 2 && seen.edges.every((one) => leansPink(one, seen.pink)), seen.edges.join(' '))
check('everyday: no welcome note', !seen.note, seen.note)
if (SHOTS) await page.screenshot({ path: `${SHOTS}/everyday-dark.png` })
// A name you write yourself, the same as the words say, is never shown as read from them.
await page.evaluate((s) => document.querySelector(s)?.editor?.commands.clearContent(true), EDITOR)
await page.keyboard.type('“Do or do not.”')
await wait(600)
await page.click('[data-under-tall-toast] input')
await page.keyboard.type('Yoda')
await wait(200)
await page.click(EDITOR)
await page.keyboard.press('End')
await page.keyboard.type(' - Yoda')
await wait(700)
seen = await look()
check('a who you wrote is never tied', !seen.tied.length, seen.tied.join('|'))

// --- the ? sheet lists the words the box reads ---------------------------------------
await page.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:shortcuts')))
await wait(500)
const sheet = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')?.textContent ?? '')
check('the ? sheet lists the words quick capture reads', sheet.includes('Words quick capture reads') && sheet.includes('After a quote: fills who said it'), sheet.slice(0, 80))
await page.keyboard.type('quote')
await wait(400)
if (SHOTS) await page.screenshot({ path: `${SHOTS}/sheet-dark.png` })
await page.keyboard.press('Escape')

check('no page errors', !errors.length, errors.join(' ; '))
const child = electron.process()
await qa.close?.()
try { child.kill('SIGKILL') } catch {}
done()
