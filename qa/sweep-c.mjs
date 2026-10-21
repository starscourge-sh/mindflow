// Short words, side by side.
// 1. Every Settings note is one sentence of about 20 words or fewer; what had
//    no room is behind the “?” beside the title, and still found by search.
// 2. Menu items, ⌘K actions and setting titles are short names (four words or
//    fewer), apart from a few listed below with the reason; the old long words
//    still find each ⌘K action.
// 3. Today's newer parts (the hour timeline, “For tomorrow”, “I have 15
//    minutes”, goals, the brief) sit together without overlapping, at
//    1100x700 and 1600x1000, light and dark.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-sweepc/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/sweep-c.mjs
// PART=notes|labels|today runs one part.
import { mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const part = process.env.PART ?? ''
let passed = 0, failed = 0
const check = (ok, what, detail = '') => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`))
const words = (text) => text.trim().split(/\s+/).filter((one) => /[\p{L}\p{N}]/u.test(one)).length
// A sentence ends at . ! or ? followed by a space and a capital; “e.g.” and numbers like 4.5 do not count.
const sentences = (text) => 1 + (text.trim().match(/[.!?](?=\s+[A-Z“"(])/g) ?? []).length

/**
 * Labels allowed past four words, and why: a count or a name inside it
 * (“Move 3 to the Bin”, “A clue to “Hamlet””), the Mac's own wording, a
 * question the button answers, or words that must match another place.
 */
const LONGER = [
  [/\$\{/, 'a count or a name inside it'],
  [/^Add to a question or goal…$/, 'both places it can go'],
  [/^Open in a new window$/, "the Mac's own words"],
  [/\?$/, 'a question it answers'],
  [/session|break|timer/i, "the session bubble's Stop asks the same, in these words (abandon.ts)"],
  [/^Carry the rest to tomorrow$/, 'one action for every open task left'],
  [/^Keep the page as a note too$/, 'says what is kept besides the page'],
  [/^Start an open question from this$/, 'inline, after a sentence'],
  [/^In Review, on a schedule$/, 'a choice beside “Not at all”'],
  [/^Start the next round by itself$/, 'other settings notes quote it in these words'],
  [/^Add who and where it’s from$/, 'its shorter form, “Add where it’s from”, once Who is there'],
  [/^Show all goals on one sticky$/, 'the same words on Home, the Goals page and the box'],
  [/^Spread over the next 3 days$/, 'says how far the late tasks are spread'],
  [/^Show a second time zone$/, 'the same words on the Calendar and in Settings'],
  [/^Just an area: drag out the part you want$/, 'the Mac\'s own screenshot choice, said with how to do it'],
  [/^Try it for 2 minutes$/, 'the two-minute rule, in its own words'],
  [/^Fresh start: put every open task on hold$/, 'says what it does to every open task'],
  [/^Tell it what to do…$/, 'the same words as the search bar\'s own'],
  [/^Turn back into a note$/, 'the one form of “Turn 3 back into notes”']
]
const allowed = (label) => words(label.replace(/\$\{[^}]*\}/g, 'N')) <= 4 || LONGER.some(([rule]) => rule.test(label))

/** Every menu line, ⌘K action, button and setting title written in the app's code, with where it is. */
function labelsInCode() {
  const require = createRequire(import.meta.url)
  const ts = require('typescript')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'src')
  const files = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p) } }
  walk(root)
  // Not labels: made-up example notes, stat captions, the Getting started list, a key legend, a demo's chips, and the onboarding (its own helper's).
  const skip = /(examples|stats-view|focus-stats|getting-started|read-through|power-demos|welcome[^/]*)\.tsx?$/
  const ITEM = /^(DropdownMenuItem|DropdownMenuCheckboxItem|ContextMenuItem|ContextMenuCheckboxItem|Button|button)$/
  const out = []
  for (const file of files.filter((f) => !skip.test(f))) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const strs = (e) => !e ? [] : ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? [e.text] : ts.isTemplateExpression(e) ? [e.getText().slice(1, -1)] : ts.isConditionalExpression(e) ? [...strs(e.whenTrue), ...strs(e.whenFalse)] : ts.isParenthesizedExpression(e) ? strs(e.expression) : []
    const at = (n) => `${relative(root, file)}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
    const visit = (n) => {
      if (ts.isPropertyAssignment(n) && n.name.getText() === 'label') for (const one of strs(n.initializer)) out.push([at(n), one])
      if (ts.isJsxElement(n) && ITEM.test(n.openingElement.tagName.getText())) {
        const text = n.children.filter(ts.isJsxText).map((c) => c.getText()).join(' ').replace(/\s+/g, ' ').trim()
        if (text && !n.children.some((c) => ts.isJsxExpression(c) && c.expression)) out.push([at(n), text])
      }
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === 'Setting')
        for (const p of n.attributes.properties) if (ts.isJsxAttribute(p) && p.name.getText() === 'title' && p.initializer) { const i = ts.isJsxExpression(p.initializer) ? p.initializer.expression : p.initializer; for (const one of strs(i)) out.push([at(n), one]) }
      ts.forEachChild(n, visit)
    }
    visit(src)
  }
  return out
}

const c = await sandbox({ width: 1440, height: 900 })
const { h, v, page: box } = c
const wait = (ms = 400) => h.waitForTimeout(ms)

try {
  if (!part || part === 'notes') {
    await c.go('settings')
    const sections = await h.$$eval('[data-section]', (all) => all.map((one) => one.dataset.section))
    const notes = []
    for (const name of sections) {
      await h.click(`[data-section="${name}"]`)
      await wait(700)
      notes.push(...await h.$$eval('[data-setting]', (all) => all.map((one) => ({ title: one.dataset.settingTitle, note: one.querySelector('p.mf-prose')?.innerText ?? '', more: !!one.querySelector('[data-setting-more]') }))))
    }
    const counts = notes.map((one) => words(one.note))
    const avg = counts.reduce((a, b) => a + b, 0) / notes.length
    const written = counts.filter((n) => n > 0)
    console.log(`notes with words: ${written.length}, average ${(written.reduce((a, b) => a + b, 0) / written.length).toFixed(1)} words, over 20: ${counts.filter((n) => n > 20).length}, more than one sentence: ${notes.filter((one) => sentences(one.note) > 1).length}`)
    console.log(`rows: ${notes.length}, average ${avg.toFixed(1)} words, longest ${Math.max(...counts)}, with a “?”: ${notes.filter((one) => one.more).length}`)
    const long = notes.filter((one) => words(one.note) > 20)
    const many = notes.filter((one) => sentences(one.note) > 1)
    check(long.length === 0, 'every Settings note is 20 words or fewer', long.map((one) => `${one.title}: ${words(one.note)}`).join('; '))
    check(many.length === 0, 'every Settings note is one sentence', many.map((one) => one.title).join('; '))
    // The words moved behind the “?” still find their setting.
    await h.fill('[data-settings-search], input[placeholder*="Search"]', 'Raycast')
    await wait(600)
    const found = await h.$$eval('[data-setting]', (all) => all.map((one) => one.dataset.settingTitle))
    check(found.includes('Auto-close quick capture'), '“Raycast”, now only in a “?” tip, still finds its setting', found.join(', '))
    await h.fill('[data-settings-search], input[placeholder*="Search"]', '')
    await wait(400)
    // The “?” opens its words.
    await h.click('[data-section="Appearance"]')
    await wait(600)
    await h.hover('[data-setting-more]')
    await wait(900)
    check(await h.locator('[data-slot="tooltip-content"]').count() > 0, 'pointing at a “?” shows the rest')
    for (const theme of ['paper', 'github']) {
      if (theme !== 'paper') { await c.theme(theme); await c.go('settings'); await h.click('[data-section="Appearance"]'); await wait(600); await h.hover('[data-setting-more]'); await wait(900) }
      await h.screenshot({ path: `${dir}/settings-notes-${theme}.png` })
    }
    await c.theme('paper')
  }

  if (!part || part === 'labels') {
    const seen = labelsInCode()
    const over = seen.filter(([, label]) => !allowed(label))
    console.log(`labels in the code: ${seen.length}, over four words: ${seen.filter(([, label]) => words(label.replace(/\$\{[^}]*\}/g, 'N')) > 4).length}, allowed by a listed reason: ${seen.filter(([, label]) => words(label.replace(/\$\{[^}]*\}/g, 'N')) > 4 && allowed(label)).length}`)
    check(seen.length > 300, 'read the labels in the code', String(seen.length))
    check(over.length === 0, 'every label is four words or fewer, or a listed exception', over.map(([where, label]) => `${where} ${label}`).join(' | '))
    const actions = (where) => where.$$eval('[data-action-label]', (all) => all.map((one) => one.textContent.trim()))
    // The gear menu's short names say the rest as a tip.
    await box.evaluate(() => window.api.showPrompt()).catch(() => {})
    await box.waitForTimeout(600)
    await box.locator('.tiptap.ProseMirror').first().click().catch(() => {})
    await box.keyboard.type('A short note')
    await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('view='))?.webContents.send('window:pointer', true))
    await box.waitForTimeout(200)
    const gear = box.getByRole('button', { name: 'Actions', exact: true })
    // Put away by a part before, quick capture is called up again until its gear is there.
    for (let i = 0; i < 5 && !(await gear.count()); i++) { await box.evaluate(() => window.api.showPrompt()).catch(() => {}); await box.waitForTimeout(1000) }
    if (await gear.count()) {
      await gear.click()
      await box.waitForTimeout(500)
      const lines = await box.$$eval('[role=menuitemcheckbox], [role=menuitem]', (all) => all.map((one) => one.textContent.trim()))
      check(lines.some((one) => one.startsWith('Lock')) && !lines.some((one) => one.includes('Lock: read only')), 'the gear menu says “Lock”, not “Lock: read only”', lines.slice(0, 6).join(' / '))
      // A short name says the rest as a tip. (Raw data sits in the gear menu; box-zen.mjs opens it there.)
      await box.getByRole('menuitemcheckbox', { name: 'Lock', exact: true }).hover()
      await box.waitForTimeout(900)
      const tip = await box.locator('[data-slot="tooltip-content"]', { hasText: 'Read only' }).first().innerText({ timeout: 3000 }).catch(() => '')
      check(/Read only until you unlock it/.test(tip), 'pointing at “Lock” says what it does', tip)
      for (const theme of ['paper', 'github']) {
        await box.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
        await box.waitForTimeout(500)
        await box.screenshot({ path: `${dir}/gear-menu-${theme}.png` })
      }
      await box.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
      await box.keyboard.press('Escape')
    } else check(false, 'found the gear menu')
    // Old words still find the new short names in ⌘K.
    await c.go('home')
    for (const [old, now] of [['tasks that fit the time', 'I have 15 minutes'], ['what got done', 'Close the day'], ['seasons of life', "Open the year's page"], ['tidy: a few minutes', 'Tidy captures'], ['split: this page', 'Split the page']]) {
      await h.keyboard.press('Meta+k')
      await wait(500)
      await h.keyboard.type(old)
      await wait(700)
      const first = (await actions(h))[0] ?? ''
      check(first.startsWith(now), `⌘K “${old}” finds “${now}”`, first)
      if (now === 'Close the day') for (const theme of ['paper', 'github']) { if (theme !== 'paper') await c.theme(theme); if (theme !== 'paper') { await h.keyboard.press('Meta+k'); await wait(500); await h.keyboard.type(old); await wait(700) } await h.screenshot({ path: `${dir}/cmdk-hint-${theme}.png` }) }
      await h.keyboard.press('Escape')
      await wait(300)
    }
    await c.theme('paper')
  }

  if (!part || part === 'today') {
    // Evening, so “For tomorrow” is up; tasks with lengths so the timeline and 15 minutes have something.
    await v('settings:set', { closeDayAt: '00:01', tomorrowBox: true }).catch(() => {})
    for (const [w, hh] of [[1100, 700], [1600, 1000]]) {
      await c.size(w, hh)
      for (const theme of ['paper', 'github']) {
        await c.theme(theme)
        await c.go('today')
        await wait(1200)
        const parts = await h.evaluate(() => {
          const pick = (name, sel) => [...document.querySelectorAll(sel)].filter((one) => one.checkVisibility()).map((one) => ({ name, r: one.getBoundingClientRect() }))
          return [
            ...pick('timeline', '[data-day-timeline]'),
            ...pick('tomorrow', '[data-tomorrow-box]'),
            ...pick('fits', '[data-fits-button]'),
            ...pick('title', 'h1'),
            ...pick('rows', '[data-task-row], [data-day-line]')
          ].map((one) => ({ name: one.name, x: one.r.x, y: one.r.y, w: one.r.width, h: one.r.height }))
        })
        const overlaps = []
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j]
          if (a.name === b.name) continue
          const inside = (p, q) => p.x >= q.x - 1 && p.y >= q.y - 1 && p.x + p.w <= q.x + q.w + 1 && p.y + p.h <= q.y + q.h + 1
          if (inside(a, b) || inside(b, a)) continue
          if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) overlaps.push(`${a.name}/${b.name}`)
        }
        const sideways = await h.evaluate(() => [document.documentElement, ...document.querySelectorAll('.overflow-y-auto')].every((one) => one.scrollWidth <= one.clientWidth + 1))
        check(overlaps.length === 0, `Today at ${w}x${hh} (${theme}): parts do not overlap`, `${parts.map((one) => one.name).join(',')} ${overlaps.join(' ')}`)
        check(sideways, `Today at ${w}x${hh} (${theme}): no sideways scroll`)
        await h.screenshot({ path: `${dir}/today-${w}-${theme}.png` })
        await h.screenshot({ path: `${dir}/today-${w}-${theme}-full.png`, fullPage: true })
      }
    }
    await c.theme('paper')
  }
  if (part === 'walk') {
    // Today's newer parts photographed together, light and dark, for a person's look over them.
    await v('settings:set', { closeDayAt: '00:01', tomorrowBox: true }).catch(() => {})
    const shot = (name) => h.screenshot({ path: `${dir}/walk-${name}.png` })
    const into = async (sel) => { await h.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await wait(700) }
    for (const theme of ['paper', 'github']) {
      await c.size(1300, 860)
      await c.theme(theme)
      await c.go('today'); await wait(900)
      await shot(`today-top-${theme}`)
      await into('[data-tomorrow-box]'); await shot(`today-tomorrow-${theme}`)
      await h.click('[data-fits-button]').catch(() => {}); await wait(900); await shot(`today-fits-${theme}`); await h.keyboard.press('Escape'); await wait(400)
      await c.go('day'); await wait(1200); await shot(`day-top-${theme}`)
      await into('[data-day-timeline]'); await shot(`day-timeline-${theme}`)
      await into('[data-tomorrow-box]'); await shot(`day-tomorrow-${theme}`)
      await c.go('all'); await wait(1000); await shot(`everything-${theme}`)
      await c.go('week'); await wait(1500); await shot(`week-${theme}`)
      await c.go('weekpage'); await wait(1500); await shot(`weekpage-${theme}`)
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-day'))); await wait(1500); await shot(`close-day-${theme}`)
      await h.mouse.wheel(0, 900); await wait(600); await shot(`close-day-2-${theme}`)
      await h.keyboard.press('Escape'); await wait(600)
      await h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:close-week'))); await wait(1500); await shot(`close-week-${theme}`)
      await h.mouse.wheel(0, 900); await wait(600); await shot(`close-week-2-${theme}`)
      await h.keyboard.press('Escape'); await wait(600)
      await c.go('settings'); await h.click('[data-section="Appearance"]'); await wait(600); await into('[data-setting-title="App icon"]'); await shot(`settings-icon-${theme}`)
      // Quick capture: a single word, its meaning under it; then the buttons hidden.
      await box.evaluate(() => window.api.showPrompt()).catch(() => {})
      await box.waitForTimeout(600)
      await box.locator('.tiptap.ProseMirror').first().click().catch(() => {})
      await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
      await box.keyboard.type('serendipity'); await box.waitForTimeout(2500)
      await box.screenshot({ path: `${dir}/walk-box-word-${theme}.png` })
      await v('settings:set', { boxHideButtons: true }).catch(() => {}); await box.waitForTimeout(800)
      await box.screenshot({ path: `${dir}/walk-box-hidden-${theme}.png` })
      await v('settings:set', { boxHideButtons: false }).catch(() => {})
      await box.keyboard.press('Meta+a'); await box.keyboard.press('Backspace')
    }
    await c.theme('paper')
  }
} catch (error) {
  failed++
  console.log('FAIL', error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? `errors: ${c.errors.slice(0, 5).join(' | ')}` : 'no page errors')
  console.log(`${passed} passed, ${failed} failed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}
