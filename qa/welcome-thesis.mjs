// The welcome's case for Vigil, read as a newcomer from Obsidian who writes:
//  - Why opens the welcome, and settled it holds the whole story: the line, three tools each by what it is for, the answer typed in, what a commonplace book is
//  - the answer's key words shine (.mf-sheen), and so does the writer's line on Write: only a few words, never a whole line
//  - no claim a fan could argue with: no tool is said to forget or not know something, and no split picture repeats The flow
//  - A day's answers are typed with their key words shining, and Review is named there and nowhere else in the stage words
//  - the payoff talks about what changes for them, not the sidebar; the Obsidian line says [[ and @ both link; the tag line is light
//  - the tag field types example tags into itself, and stops once it has focus
//  - with Motion off the sheen holds still, and still shines
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/welcome-thesis.mjs [shots-dir] [light|dark]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let failed = 0
const check = (name, ok, more = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${more ? `  (${more})` : ''}`)
}
// Words that would make Vigil sound like a link between other apps rather than one book doing all of it.
const CONNECTOR = /between them|thread between|\bconnects?\b|\bbridges?\b|in sync with|syncs? with|integrat/i
const NEXT = 'footer button:has-text("Next"), footer button:has-text("Show me")'
const c = await sandbox({ width: 1440, height: 900, seeded: false })
const { h } = c
const chapter = () => h.evaluate(() => document.querySelector('.mf-welcome footer .sr-only')?.textContent ?? '')
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    if (await h.evaluate(() => [...document.querySelectorAll('.mf-welcome [data-reel]')].every((el) => el.dataset.reel === 'done'))) return
    await h.keyboard.press('Escape')
    await h.waitForTimeout(400)
  }
}
const until = async (name) => {
  for (let i = 0; i < 40 && !(await chapter()).includes(name); i++) {
    const skip = await h.$('footer button:has-text("Skip trying it")')
    await (skip ? skip.click() : h.click(NEXT))
    await h.waitForTimeout(600)
  }
  return (await chapter()).includes(name)
}
const shot = async (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${THEME}-${name}.png` })
try {
  await c.theme(THEME)
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  await h.waitForTimeout(800)
  check('the welcome opens on Why, chapter 1', /Chapter 1 of \d+: Why/.test(await chapter()), await chapter())
  await shot('why-start')
  await settle()
  await h.waitForTimeout(900)
  const why = await h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()))
  check('settled, Why says it all, in order', why.length === 7 && /You don.t take notes to do nothing with them/.test(why[0]) && /^Obsidian is for keeping notes/.test(why[1]) && /^Todoist is for doing/.test(why[2]) && /^Anki is for remembering/.test(why[3]) && /^Why jump between apps to write down things that work better together\?$/.test(why[4]) && /^In Vigil you write, read, study and plan in one place, because it.s all connected\.$/.test(why[5]) && /commonplace book: one notebook/.test(why[6]), why.join(' | '))
  check('no tool is said to forget or not know anything', !why.some((one) => /forget|not why|but not|nothing like/i.test(one)), why.slice(1, 4).join(' | '))
  check('no split picture on Why (The flow shows how a thought grows, once)', !(await h.$('[data-thread]')))
  const shine = await h.evaluate(() => [...document.querySelectorAll('[data-thesis="answer"] .mf-sheen')].map((el) => el.textContent))
  check('only the answer\'s key words shine', shine.join() === 'in one place', shine.join())
  // Vigil does the three itself: no line of Why says it sits between, links or syncs other apps.
  check('Why never says Vigil sits between or connects other apps', !why.some((one) => CONNECTOR.test(one)), why.filter((one) => CONNECTOR.test(one)).join(' | '))
  await shot('why')

  await h.click(NEXT)
  await h.waitForTimeout(800)
  // The tag field types its examples in.
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    seen.add(await h.getAttribute('input[aria-label="Your own tag"]', 'placeholder'))
    await h.waitForTimeout(100)
  }
  check('the tag field types example tags in, a letter at a time', seen.size >= 5 && [...seen].some((one) => /^re/.test(one ?? '')), [...seen].slice(0, 8).join(','))
  await h.click('input[aria-label="Your own tag"]')
  await h.waitForTimeout(300)
  const held = await h.getAttribute('input[aria-label="Your own tag"]', 'placeholder')
  await h.waitForTimeout(600)
  check('it stops once the field has focus', held === (await h.getAttribute('input[aria-label="Your own tag"]', 'placeholder')), held ?? '')
  await h.click('.mf-welcome h1')
  await h.click('button[aria-pressed]:has-text("Writing and reading")')
  await h.click('button[aria-pressed]:has-text("Obsidian")')
  await h.click('button[aria-pressed]:has-text("#reading")')
  await h.waitForTimeout(200)
  await h.click(NEXT)
  await h.waitForSelector('[data-payoff]', { timeout: 6000 })
  await h.waitForTimeout(1600)
  const paid = (await h.innerText('[data-payoff]')).replace(/\s+/g, ' ')
  check('the payoff leads with what Vigil does for writing, not how the sidebar is arranged', /^Ready for writing and reading\. Lines you keep/.test(paid) && !/Settings, Sidebar|leads with what/.test(paid), paid.slice(0, 120))
  check('for Obsidian: [[ and @ both link, and bringing the vault is one step', /\[\[/.test(paid) && /@/.test(paid) && /one step at the end/.test(paid))
  const tip = await h.evaluate(() => { const el = document.querySelector('[data-payoff] [data-tip="Obsidian"]'); return el ? { text: el.innerText.replace(/\s+/g, ' '), tick: !!el.querySelector('.lucide-check'), made: !!document.querySelector('[data-payoff] [data-made="from"]') } : null })
  check('the Obsidian advice sits apart: its own "From Obsidian" aside, no tick, not among the ticked rows', !!tip && /^From Obsidian/.test(tip.text) && !tip.tick && !tip.made, JSON.stringify(tip))
  check('the first tag is light and changeable', /#reading/.test(paid) && /rename or drop/.test(paid))
  await shot('payoff-obsidian')
  // A fresh install's first welcome may add to the sidebar, never take away: the task pages stay, and the payoff says what it added.
  const side = (await c.v('settings')).sidebarShown ?? []
  check('writing adds Tags to the sidebar and keeps Inbox, Review, Today, This week and Upcoming', ['inbox', 'review', 'today', 'week', 'upcoming', 'tags'].every((one) => side.includes(one)), side.join(','))
  check('the payoff says the sidebar gained Tags, and that nothing was taken out', /Tags are in your sidebar/.test(paid) && /Nothing was taken out/.test(paid))

  await until('Write')
  await settle()
  const mine = await h.evaluate(() => {
    const el = document.querySelector('[data-for-you]')
    return el ? { all: el.textContent, shine: [...el.querySelectorAll('.mf-sheen')].map((one) => one.textContent).join('|') } : null
  })
  check('the writer\'s line on Write shines only on the words that carry it', !!mine && mine.shine === 'next to the reading they came from' && mine.all.length > mine.shine.length + 10, JSON.stringify(mine))
  await shot('write-for-you')

  // A day: each answer typed in, its key words shining; Review named here once.
  await until('A day')
  await h.waitForTimeout(1500)
  await settle()
  const answers = await h.evaluate(() => [...document.querySelectorAll('[data-answer]')].map((el) => ({ shine: [...el.querySelectorAll('.mf-sheen')].map((one) => one.textContent).join('|'), all: el.getAttribute('aria-label') })))
  check('A day\'s three answers each shine on their key words', answers.length === 3 && answers.every((one) => one.shine && one.all.length > one.shine.length + 10), JSON.stringify(answers))
  check('the evening names Review, the one place it is said', /Review/.test(answers[2]?.all ?? ''), answers[2]?.all ?? '')
  await shot('day')

  // Motion off: no sweep, still the foil.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  const still = await h.evaluate(() => {
    const el = document.querySelector('.mf-sheen')
    const css = el && getComputedStyle(el)
    return css ? { anim: css.animationName, image: css.backgroundImage.slice(0, 30) } : null
  })
  check('with Motion off the sheen holds still, and still shines', !!still && still.anim === 'none' && /gradient/.test(still.image), JSON.stringify(still))
  await h.evaluate(() => delete document.documentElement.dataset.motion)
  // Replayed, the welcome never touches the sidebar: someone's own arrangement stays theirs.
  const arranged = ['inbox', 'today', 'week', 'upcoming', 'review']
  await c.v('settings:set', { sidebarShown: arranged })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:welcome')))
  await h.waitForTimeout(1200)
  await until('You')
  await h.waitForTimeout(600)
  await h.click('button[aria-pressed]:has-text("Study")')
  await h.waitForTimeout(200)
  await h.click(NEXT)
  await h.waitForTimeout(1500)
  const after = (await c.v('settings')).sidebarShown ?? []
  check('a replayed welcome leaves the sidebar as it was', after.join() === arranged.join(), after.join())
  check('and its payoff does not claim a sidebar change', !/sidebar/i.test(await h.innerText('[data-payoff]').catch(() => '')))

} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
process.exit(failed ? 1 : 0)
