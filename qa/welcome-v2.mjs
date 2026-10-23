// The second welcome, walked as a person would, in the sandbox:
//  - asked for from your own book (a welcome carried into the sandbox), it plays once the examples are set out
//  - it opens on the commonplace-book line, never "for everything you capture", with no goal question,
//    the caret already in the field and a hint line typing itself in; the one thing to do shines
//  - a first thought, a quote and a task are typed and kept with ↵, each as its own kind: the quote with
//    who said it and where, the task on its day
//  - the last ↵ lands in a page holding the first thought, the caret in it, and typing goes on in the page
//  - Settings' Welcome switch and ⌘K's "Show the welcome (version 2)" play this one; version 1 stays the default
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/welcome-v2.mjs [shots-dir]
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

// Played in the sandbox, as it is tried: whatever QA_ARGS says.
process.env.QA_ARGS = '--sandbox'
const SHOTS = process.argv[2] ?? ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const THOUGHT = 'Why does rain make the city sound closer?'
const QUOTE = '“Not all those who wander are lost.” - Tolkien, The Fellowship of the Ring'
const TASK = 'Call Mum on Saturday 6pm'

// A welcome asked for from your own book: what tryWelcome writes before the sandbox opens.
mkdirSync(join(process.env.QA_DATA, 'sandbox'), { recursive: true })
writeFileSync(join(process.env.QA_DATA, 'sandbox', 'carry.json'), JSON.stringify({ local: {}, settings: {}, welcome: { version: 2, at: Date.now() } }))

const c = await sandbox({ width: 1280, height: 800 })
const { h, v } = c
const shot = (name) => SHOTS && h.screenshot({ path: `${SHOTS}/${name}.png` })
const step = () => h.evaluate(() => Number(document.querySelector('[data-welcome-version="2"] [data-step]:not([style*="opacity: 0"])')?.dataset.step ?? 0))
const waitStep = (n) => h.waitForFunction((n) => [...document.querySelectorAll('[data-welcome-version="2"] [data-step]')].some((el) => Number(el.dataset.step) === n), n, { timeout: 8000 })
try {
  const came = await h.waitForSelector('[data-welcome-version="2"]', { timeout: 20000 }).then(() => true, () => false)
  check('asked for from your own book, version 2 plays on arriving in the sandbox', came)
  check('only one welcome is up', (await h.locator('.mf-welcome').count()) === 1)
  await h.waitForTimeout(400)
  const first = await h.evaluate(() => ({
    book: document.querySelector('[data-book]')?.textContent ?? '',
    all: document.querySelector('.mf-welcome')?.textContent ?? '',
    focus: document.activeElement?.getAttribute('data-welcome-field'),
    shine: document.querySelector('.mf-welcome .mf-sheen')?.textContent ?? ''
  }))
  check('it opens on the commonplace-book line', /commonplace book/.test(first.book), first.book)
  check('it never says "for everything you capture" and asks no goal', !/for everything you capture/i.test(first.all) && !/goal/i.test(first.all))
  check('the caret is in the first field from the start', first.focus === '1', String(first.focus))
  check('the one thing to do shines', /Your turn/.test(first.shine), first.shine)
  const hints = new Set()
  for (let i = 0; i < 30; i++) (hints.add(await h.getAttribute('[data-welcome-field="1"]', 'placeholder')), await h.waitForTimeout(120))
  check('a hint line types itself into the field', hints.size >= 5, `${hints.size} lengths`)
  await shot('v2-1-start')

  // 1: the first thought, typed and kept with ↵.
  await h.keyboard.type(THOUGHT, { delay: 25 })
  await h.keyboard.press('Enter')
  await waitStep(2)
  await h.waitForTimeout(700)
  const two = await h.evaluate(() => ({ focus: document.activeElement?.getAttribute('data-welcome-field'), kept: document.querySelector('[data-kept-kind="note"]')?.textContent ?? '' }))
  check('↵ keeps the thought and goes on to the quote, the caret in its field', two.focus === '2' && two.kept.includes('rain make'), JSON.stringify(two))
  await shot('v2-2-quote')

  // 2: a quote, with who said it and where.
  await h.keyboard.type(QUOTE, { delay: 10 })
  await h.keyboard.press('Enter')
  await waitStep(3)
  await h.waitForTimeout(700)
  const quotes = await h.evaluate(() => window.api.captures.list()).then((list) => list.filter((one) => one.kind === 'quote' && /wander/.test(one.label)))
  check('the quote is kept as a quote, with who said it', quotes.length === 1 && /Tolkien/.test(quotes[0].attribution ?? ''), JSON.stringify(quotes[0] ?? null).slice(0, 200))
  check('its line says what was read', /Tolkien/.test(await h.textContent('[data-kept-kind="quote"]')))
  await shot('v2-3-task')

  // 3: a task, on its day.
  await h.keyboard.type(TASK, { delay: 15 })
  await h.keyboard.press('Enter')
  await waitStep(4)
  await h.waitForTimeout(900)
  const tasks = (await v('tasks')).filter((one) => /Call Mum/.test(one.title))
  check('the task is on the list, on its day', tasks.length === 1 && !!tasks[0].dueAt, JSON.stringify(tasks[0] ?? null).slice(0, 200))
  const end = await h.evaluate(() => document.querySelector('[data-end-page]')?.textContent ?? '')
  check('the last step shows the page with the first thought', end.includes('rain make'), end)
  await shot('v2-4-write')

  // 4: ↵ into the page.
  await h.keyboard.press('Enter')
  await h.waitForFunction(() => !document.querySelector('.mf-welcome'), null, { timeout: 5000 })
  await h.waitForFunction(() => !!document.activeElement?.closest('.ProseMirror'), null, { timeout: 6000 }).catch(() => {})
  await h.waitForTimeout(800)
  const pages = (await v('items', 'article')).filter((one) => (one.title ?? '').includes('rain make'))
  const landed = await h.evaluate(() => {
    const editor = document.activeElement?.closest('.ProseMirror')
    return { inPage: !!editor, page: document.body.innerText.includes('Why does rain make the city sound closer?') }
  })
  check('the welcome ends inside a page in Pages named by the first thought, the caret in it', pages.length === 1 && landed.inPage && landed.page, JSON.stringify({ ...landed, pages: pages.length }))
  await h.keyboard.type('Maybe it is the grain.', { delay: 20 })
  await h.waitForTimeout(1500)
  const after = await h.evaluate(() => document.activeElement?.closest('.ProseMirror')?.textContent ?? '')
  check('typing goes into the page', after.includes('Maybe it is the grain.'), after.slice(0, 120))
  await shot('v2-5-page')
  const once = await h.evaluate(() => window.api.captures.list()).then((list) => list.filter((one) => one.label.includes('rain make')).length)
  check('the first thought is the page alone, not also a note left in the Inbox', once === 0, `${once}`)

  // The switch: version 1 by default; Settings' Welcome row picks version 2, and "Show the welcome again" then plays it.
  const state = await v('onboarding:state')
  check('version 1 is the one chosen until Settings says otherwise', state.welcomeVersion === 1, `${state.welcomeVersion}`)
  await c.go('settings')
  await h.waitForTimeout(800)
  await h.click('button[data-section="Help"]')
  await h.waitForTimeout(500)
  await shot('v2-6-settings')
  const row = h.locator('button[aria-label="Version 2"]').first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  // Pressed as a person does, and again if the first press landed while the page was still settling.
  for (let i = 0; i < 3 && (await v('onboarding:state')).welcomeVersion !== 2; i++) {
    await row.scrollIntoViewIfNeeded()
    await row.click()
    for (let t = 0; t < 20 && (await v('onboarding:state')).welcomeVersion !== 2; t++) await h.waitForTimeout(100)
  }
  check('Settings › Welcome picks version 2', (await v('onboarding:state')).welcomeVersion === 2)
  await shot('v2-7-settings-picked')
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:welcome')))
  const v2again = await h.waitForSelector('[data-welcome-version="2"]', { timeout: 5000 }).then(() => true, () => false)
  check('"Show the welcome again" plays the one picked, and only that one', v2again && (await h.locator('.mf-welcome').count()) === 1)
  // Replayed, the headline is simply there.
  check('replayed, the first line is whole at once', (await h.getAttribute('[data-head]', 'data-typed')) === String('Come here to write. So just start.'.length))
  await h.click('button[data-skip]')
  await h.waitForFunction(() => !document.querySelector('.mf-welcome'), null, { timeout: 4000 })

  // ⌘K: either version by name; in the sandbox it plays at once.
  for (const version of [1, 2]) {
    await h.keyboard.press('Meta+k')
    await h.waitForTimeout(500)
    await h.keyboard.type(`Show the welcome (version ${version})`, { delay: 15 })
    await h.waitForTimeout(700)
    await h.keyboard.press('Enter')
    const up = await h.waitForSelector('.mf-welcome', { timeout: 5000 }).then(() => true, () => false)
    const which = await h.evaluate(() => document.querySelector('.mf-welcome')?.getAttribute('data-welcome-version') ?? '1')
    check(`⌘K "Show the welcome (version ${version})" plays version ${version}`, up && which === String(version), which)
    if (version === 1) {
      // Version 1's own way out.
      await h.click('button[data-skip]')
      await h.waitForTimeout(600)
      await h.click('button[data-skip]')
    } else await h.click('button[data-skip]')
    await h.waitForFunction(() => !document.querySelector('.mf-welcome'), null, { timeout: 5000 }).catch(() => {})
  }
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} finally {
  await c.close()
}
done()
