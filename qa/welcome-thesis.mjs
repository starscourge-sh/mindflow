// The welcome's case for Haligtree, read as a newcomer from Obsidian who writes:
//  - Why opens the welcome, and settled it holds the whole story: the line, three kinds of app each by what it keeps, why notes go unseen (going back is your job), the answer typed in, what a commonplace book is
//  - Why says where thinking lives now in plain words (writing, plans, what you mean to remember), no brands
//  - the answer's key words shine (.mf-sheen), and so does the writer's line on Write: only a few words, never a whole line
//  - no claim a fan could argue with: no tool is said to forget or not know something, and no split picture of the three apps
//  - the last line names the cycle the chapters follow (catch, write, it finds you again)
//  - Remember's three lines each shine on their key words, and the gem's names Review
//  - the payoff talks about what changes for them, not the sidebar; the Obsidian line says [[ and @ both link; the tag line is light
//  - the tag field types example tags into itself, and stops once it has focus
//  - with Motion off the sheen holds still, and still shines
//  - Raycast is a tool you can say you used: its tip says how quick capture opens and sends, keys as keys, and claims no import
//  - the newer copy: old notes can wait, write at length, a postcard from your past self, Paper to Gruvbox
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-thesis.mjs [shots-dir] [light|dark]
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
// A fresh install, always: --sandbox seeds goals and marks the welcome as not the first, which these checks are not about.
process.env.QA_ARGS = (process.env.QA_ARGS ?? '').replace('--sandbox', '').trim()
import { checks } from './harness.mjs'
// A fresh install is never the sandbox (it has no first run): run as one whatever QA_ARGS says.
if (/--sandbox/.test(process.env.QA_ARGS ?? '')) delete process.env.QA_ARGS

const SHOTS = process.argv[2] ?? ''
const THEME = process.argv[3] ?? 'light'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
// Words that would make Haligtree sound like a link between other apps rather than one book doing all of it.
const CONNECTOR = /between them|thread between|\bconnects?\b|\bbridges?\b|in sync with|syncs? with|integrat/i
const NEXT = 'footer button:has-text("Next"), footer button:has-text("Show me")'
const c = await sandbox({ width: Number(process.env.QA_WIDTH ?? 1440), height: 900, seeded: false })
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
  if (!(await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false))) await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForSelector('.mf-welcome', { timeout: 8000 })
  // Through the arrival's mist first (qa/welcome-mist.mjs).
  await h.waitForSelector('[data-thesis="line"]', { timeout: 15000 })
  await h.waitForTimeout(800)
  check('the welcome opens on Why, chapter 1', /Chapter 1 of \d+: Why/.test(await chapter()), await chapter())
  await shot('why-start')
  await settle()
  await h.waitForTimeout(900)
  const why = await h.evaluate(() => [...document.querySelectorAll('[data-thesis]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()))
  check('settled, Why says it all, in order', why.length === 6 && /^Most notes are written once and never seen again\.$/.test(why[0]) && /^Your writing lives in one app\.$/.test(why[1]) && /^Your plans live in another\.$/.test(why[2]) && /^What you want to remember and practice \(flashcards\) lives in a third\.$/.test(why[3]) && /^In each one, going back is your job\. So mostly, nobody does\.$/.test(why[4]) && /^Haligtree treats writing, planning and memory not as three separate tools, but as the same thought evolving over time\.$/.test(why[5]), why.join(' | '))
  const italic = await h.evaluate(() => [...document.querySelectorAll('[data-thesis^="gap-"]')].map((li) => getComputedStyle(li.querySelector('.italic') ?? li).fontStyle))
  check('what each kind of app keeps is in italics, after its name', italic.length === 3 && italic.every((one) => one === 'italic'), JSON.stringify(italic))
  check('the Why page names no place in Haligtree a newcomer has not seen yet', !/Home|Review/.test(why.join(' ')), why.join(' | '))
  check('each kind of thinking is named in bold, by where it lives', (await h.evaluate(() => [1, 2, 3].map((i) => document.querySelector(`[data-thesis="gap-${i - 1}"] .font-semibold`)?.textContent))).join('|') === 'Your writing|Your plans|What you want to remember and practice (flashcards)')
  check('no kind of app is said to forget or not know anything', !why.slice(1, 4).some((one) => /forget|not why|but not|nothing like/i.test(one)), why.slice(1, 4).join(' | '))
  check('Why names no app: a newcomer who has never heard of them is never lost', !why.some((one) => /Notion|Obsidian|Todoist|Anki|Evernote|Apple Notes|Quizlet/i.test(one)), why.join(' | '))
  check('no split picture on Why (the story is told once, in Catch, Write and Remember)', !(await h.$('[data-thread]')))
  const shine = await h.evaluate(() => [...document.querySelectorAll('[data-thesis="answer"] .mf-sheen')].map((el) => el.textContent))
  check('only the answer\'s key words shine', shine.join() === 'the same thought evolving over time', shine.join())
  // The margin note beside the three, and the tagline's promise underlined by hand.
  check('a note in the margin beside the three, its arrow drawn', await h.evaluate(() => document.querySelector('[data-margin-note]')?.dataset.marginNote === 'on' && /You never write anything down to do nothing with it\./.test(document.querySelector('[data-margin-words]')?.textContent ?? '')))
  check('the note sits in a margin, clear of the words', await h.evaluate(() => { const box = document.querySelector('[data-margin-note]'); const n = document.querySelector('[data-margin-words]').getBoundingClientRect(); const lines = [...document.querySelectorAll('[data-thesis^="gap-"]')].map((li) => li.getBoundingClientRect()); const right = Math.max(...[...document.querySelectorAll('[data-thesis^="gap-"] span')].map((one) => one.getBoundingClientRect().right)); return box.dataset.side !== 'none' && (n.right <= lines[0].left - 30 || n.left >= right + 30) && n.left >= 0 && n.right <= innerWidth }))
  check('the tagline\'s promise is underlined, on one line', await h.evaluate(() => { const ink = document.querySelector('[data-tagline] [data-ink]'); return !!ink && ink.textContent === 'come back to you' && ink.getClientRects().length === 1 }))
  // Haligtree does the three itself: no line of Why says it sits between, links or syncs other apps.
  check('Why never says Haligtree sits between or connects other apps', !why.some((one) => CONNECTOR.test(one)), why.filter((one) => CONNECTOR.test(one)).join(' | '))
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
  const you = (await h.innerText('.mf-welcome')).replace(/\s+/g, ' ')
  check('Raycast is among the tools you used before', !!(await h.$('button[aria-pressed]:has-text("Raycast")')))
  const fit = await h.evaluate(() => {
    const field = document.querySelector('[data-welcome-first]')
    const ask = field?.closest('div')?.parentElement?.querySelector('p')
    const box = (one) => one.getBoundingClientRect()
    const page = innerWidth
    const words = ask ? [...ask.querySelectorAll('span')].map((one) => ({ right: Math.round(box(one).right), cut: one.scrollWidth > one.clientWidth + 1 })) : []
    const ctx = document.createElement('canvas').getContext('2d'); const cs = field && getComputedStyle(field); if (cs) ctx.font = `${cs.fontSize} ${cs.fontFamily}`
    return { words, page, placeholder: field ? ctx.measureText(field.placeholder).width <= field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 2 : false }
  })
  check('the first-thought question and its note are whole, and the field shows its whole hint', fit.words.length >= 2 && fit.words.every((one) => !one.cut && one.right <= fit.page) && fit.placeholder, JSON.stringify(fit))
  check('the first-thought question says old notes can wait for the end', /It becomes your first note\. Old notes can come over at the end\./.test(you), you.slice(0, 200))
  await h.click('button[aria-pressed]:has-text("Writing and reading")')
  await h.click('button[aria-pressed]:has-text("Obsidian")')
  await h.click('button[aria-pressed]:has-text("#reading")')
  await h.waitForTimeout(200)
  await h.click(NEXT)
  await h.waitForSelector('[data-payoff]', { timeout: 6000 })
  await h.waitForTimeout(1600)
  const paid = (await h.innerText('[data-payoff]')).replace(/\s+/g, ' ')
  check('the payoff leads with what Haligtree does for writing, not how the sidebar is arranged', /^Ready for writing and reading\. Lines you keep/.test(paid) && !/Settings, Sidebar|leads with what/.test(paid), paid.slice(0, 120))
  check('for Obsidian: [[ and @ both link, and bringing the vault is one step', /\[\[/.test(paid) && /@/.test(paid) && /one step at the end/.test(paid))
  const tip = await h.evaluate(() => { const el = document.querySelector('[data-payoff] [data-tip="Obsidian"]'); return el ? { text: el.innerText.replace(/\s+/g, ' '), tick: !!el.querySelector('.lucide-check'), made: !!document.querySelector('[data-payoff] [data-made="from"]') } : null })
  check('the Obsidian advice sits apart: its own "From Obsidian" aside, no tick, not among the ticked rows', !!tip && /^From Obsidian/.test(tip.text) && !tip.tick && !tip.made, JSON.stringify(tip))
  check('the first tag is light and changeable', /#reading/.test(paid) && /rename or drop/.test(paid))
  await shot('payoff-obsidian')
  // A fresh install's first welcome may add to the sidebar, never take away: a new book's first pages stay (sidebar-first).
  const side = (await c.v('settings')).sidebarShown ?? []
  check('the sidebar keeps Inbox, Home, Journal, Writing, Gems, Review, Tasks and Calendar', ['inbox', 'home', 'day', 'articles', 'nuggets', 'review', 'today', 'calendar'].every((one) => side.includes(one)), side.join(','))
  // Every page shows from the start (sidebar-all), so the welcome adds nothing to the sidebar and does not claim to.
  check('the payoff does not claim it added Tags to the sidebar', !/Tags are in your sidebar/.test(paid))

  // The summary's Next says where it goes; then Catch plays (Just watch first) and hands over (Now you).
  const label = await h.evaluate(() => document.querySelector('.mf-welcome footer [data-next]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
  check('the summary\'s Next says where it goes: “Show me quick capture”', /^Show me quick capture/.test(label), label)
  await h.click(NEXT)
  await h.waitForTimeout(700)
  const watch = await h.evaluate(() => document.querySelector('[data-aha="keys"]')?.textContent ?? '')
  check('while Catch plays, it says to watch first and that your turn comes after', /^Just watch first\. See how it reads what you write\. Then it is your turn\.$/.test(watch), watch)
  await settle()
  await h.waitForTimeout(900)
  const turn = await h.evaluate(() => document.querySelector('[data-turn="idle"]')?.textContent ?? '')
  check('then it hands over: “Now you: press ⌘. and write anything”, its keys as keys', /^Now you: press ⌘\.\s*and write anything/.test(turn) && /Use a different key/.test(turn), turn)
  await until('Write')
  await settle()
  const mine = await h.evaluate(() => {
    const el = document.querySelector('[data-for-you]')
    return el ? { all: el.textContent, shine: [...el.querySelectorAll('.mf-sheen')].map((one) => one.textContent).join('|') } : null
  })
  check('the writer\'s line on Write shines only on the words that carry it', !!mine && mine.shine === 'next to the reading they came from' && mine.all.length > mine.shine.length + 10, JSON.stringify(mine))
  check('Write says where captures wait and how they grow: the Inbox, a page, a line made a task or a gem', /What you catch waits in your Inbox\. When it needs room, write it out as a page, then pick out a line to make it a task or a gem\./.test(await h.innerText('.mf-welcome')))
  await shot('write-for-you')

  // Remember: each line with its key words shining; the gem's names Review.
  await until('Remember')
  await h.waitForTimeout(1500)
  await settle()
  const answers = await h.evaluate(() => [...document.querySelectorAll('[data-answer]')].map((el) => ({ shine: [...el.querySelectorAll('.mf-sheen')].map((one) => one.textContent).join('|'), all: el.getAttribute('aria-label') })))
  check('Remember\'s three lines each shine on their key words', answers.length === 3 && answers.every((one) => one.shine && one.all.length > one.shine.length + 10), JSON.stringify(answers))
  check('Remember says each thing you keep comes back when you need it', /Each thing you keep comes back when you need it: a task on its day, a gem before you forget it, a saved line a year on\./.test(await h.innerText('.mf-welcome [data-words]')))
  check('the gem comes back in Review, named there', /Review/.test(answers[1]?.all ?? ''), answers[1]?.all ?? '')
  check('the saved line comes back like a postcard from your past self', /postcard from your past self/.test(answers[2]?.all ?? ''), answers[2]?.all ?? '')
  check('the curve has no figures and no made-up days on it, only the review counts', !/\d/.test((await h.innerText('[data-curve]')).replace(/\b\d+(st|nd|rd|th)\b/g, '')))
  await shot('remember')

  // Motion off: no sweep, still the foil.
  await h.evaluate(() => (document.documentElement.dataset.motion = 'off'))
  const still = await h.evaluate(() => {
    const el = document.querySelector('.mf-sheen')
    const css = el && getComputedStyle(el)
    return css ? { anim: css.animationName, image: css.backgroundImage.slice(0, 30) } : null
  })
  check('with Motion off the sheen holds still, and still shines', !!still && still.anim === 'none' && /gradient/.test(still.image), JSON.stringify(still))
  await h.evaluate(() => delete document.documentElement.dataset.motion)
  await until('Make it yours')
  check('Make it yours names real themes, Paper to Gruvbox', /Pick how your pages look, from Paper to Gruvbox\. Change it any time in “Settings”\./.test(await h.innerText('.mf-welcome')))
  // Replayed, the welcome never touches the sidebar: someone's own arrangement stays theirs.
  const arranged = ['inbox', 'today', 'week', 'upcoming', 'review']
  await c.v('settings:set', { sidebarShown: arranged })
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  await h.waitForTimeout(1200)
  await until('You')
  await h.waitForTimeout(600)
  await h.click('button[aria-pressed]:has-text("Study")')
  // Raycast picked first, then Anki: the step to bring notes over goes under Anki, the app they come from.
  if ((await h.getAttribute('button[aria-pressed]:has-text("Obsidian")', 'aria-pressed')) === 'true') await h.click('button[aria-pressed]:has-text("Obsidian")')
  await h.click('button[aria-pressed]:has-text("Raycast")')
  await h.click('button[aria-pressed]:has-text("Anki")')
  await h.waitForTimeout(200)
  await h.click(NEXT)
  await h.waitForSelector('[data-payoff] [data-tip="Raycast"]', { timeout: 6000 }).catch(() => null)
  await h.waitForTimeout(1600)
  const ray = await h.evaluate(() => { const el = document.querySelector('[data-payoff] [data-tip="Raycast"]'); return el ? { text: el.innerText.replace(/\s+/g, ' '), keys: [...el.querySelectorAll('kbd, [data-slot="kbd"]')].map((one) => one.textContent) } : null })
  check('the Raycast tip says how quick capture opens and sends, with its keys as keys', !!ray && /^From Raycast Quick capture opens the same way: press ⌘\. over any app, type, then ⌘↵, and you are back where you were\./.test(ray.text) && ray.keys.join() === '⌘.,⌘↵', JSON.stringify(ray))
  check('the step to bring notes over sits under Anki, not under Raycast', /one step at the end/.test(await h.innerText('[data-payoff] [data-tip="Anki"]').catch(() => '')))
  check('and claims no Raycast import', !!ray && !/bring|import|notes over/i.test(ray.text) && !(await h.innerText('[data-payoff]')).includes('Raycast notes'))
  await shot('payoff-raycast')
  await h.waitForTimeout(1500)
  const after = (await c.v('settings')).sidebarShown ?? []
  check('a replayed welcome leaves the sidebar as it was', after.join() === arranged.join(), after.join())
  check('and its payoff does not claim a sidebar change', !/sidebar/i.test(await h.innerText('[data-payoff]').catch(() => '')))

} finally {
  if (c.errors.length) console.log(c.errors.join('\n'))
  await c.close()
}
done()
