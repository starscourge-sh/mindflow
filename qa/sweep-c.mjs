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
import { mkdirSync } from 'fs'
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
 * Labels allowed past four words, and why. A count or a name in the label
 * (“Move 3 to the Bin”), a removal that must say where it goes, or a
 * question the button answers.
 */
const LONGER = [
  [/^Move .* to the Bin$/, 'says where it goes, with a count'],
  [/^Close without doing$/, 'four words'],
  [/^Add to a question or goal…$/, 'both places it can go'],
  [/^Start a focus session/, 'with its length'],
  [/^Turn .* (on|off)$/, 'a switch named by its setting'],
  [/^Go to /, 'a place name'],
  [/^Open in a new window$/, 'standard Mac wording'],
  [/^Show all \d+ in /, 'a count and a place']
]
const allowed = (label) => words(label) <= 4 || LONGER.some(([rule]) => rule.test(label))

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
    const seen = []
    // The main window's ⌘K, with nothing typed: every action it lists.
    await c.go('home')
    await h.keyboard.press('Meta+k')
    await wait(700)
    const actions = async (where) => {
      const names = await where.$$eval('[data-search-at], [data-action-label]', (all) => all.map((one) => one.querySelector('span')?.textContent?.trim() ?? ''))
      return names.filter(Boolean)
    }
    seen.push(...(await actions(h)).map((label) => ['⌘K', label]))
    await h.keyboard.press('Escape')
    await wait(300)
    // A capture's right-click menu.
    await c.go('captures')
    const row = h.locator('[data-capture-row], [data-entry]').first()
    if (await row.count()) {
      await row.click({ button: 'right' })
      await wait(500)
      seen.push(...(await h.$$eval('[role=menuitem], [role=menuitemcheckbox]', (all) => all.map((one) => one.childNodes[0]?.textContent?.trim() || one.textContent.trim()))).map((label) => ['capture menu', label]))
      await h.keyboard.press('Escape')
    }
    // Quick capture's gear menu.
    await box.bringToFront().catch(() => {})
    const gear = box.locator('[aria-label="Options"], [aria-label="Settings"]').first()
    if (await gear.count()) {
      await gear.click()
      await wait(500)
      seen.push(...(await box.$$eval('[role=menuitem], [role=menuitemcheckbox]', (all) => all.map((one) => [...one.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()))).filter(Boolean).map((label) => ['gear menu', label]))
      await box.keyboard.press('Escape')
    }
    const over = seen.filter(([, label]) => !allowed(label))
    console.log(`labels read: ${seen.length}`)
    check(seen.length > 20, 'read the menus and ⌘K', String(seen.length))
    check(over.length === 0, 'every label is four words or fewer, or a listed exception', over.map(([where, label]) => `${where}: ${label}`).join(' | '))
    // Old words still find the new short names in ⌘K.
    await c.go('home')
    for (const [old, now] of [['tasks that fit the time', 'I have 15 minutes'], ['what got done', 'Close the day'], ['seasons of life', 'Year'], ['someone else', 'Open the sandbox']]) {
      await h.keyboard.press('Meta+k')
      await wait(500)
      await h.keyboard.type(old)
      await wait(700)
      const first = (await actions(h))[0] ?? ''
      check(first.startsWith(now), `⌘K “${old}” finds “${now}”`, first)
      await h.keyboard.press('Escape')
      await wait(300)
    }
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
} catch (error) {
  failed++
  console.log('FAIL', error.message.split('\n')[0])
} finally {
  console.log(c.errors.length ? `errors: ${c.errors.slice(0, 5).join(' | ')}` : 'no page errors')
  console.log(`${passed} passed, ${failed} failed`)
  await c.close()
  process.exit(failed ? 1 : 0)
}
