// What Vigil can do, the Remembering cards: each card's Try it, done in the
// sandbox, and its outcome checked in the window and the database; then its
// Show me, checked to land on its page and point at something.
//
//   npx electron-vite build --outDir out-pw
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-pw/main/index.js MINDFLOW_QA_AWAY=1 node qa/powers-claims-b.mjs
import { sandbox } from './sandbox-lib.mjs'

const s = await sandbox({ width: 1280, height: 860 })
const { h, v, go, send } = s
const wait = (ms = 700) => h.waitForTimeout(ms)
const text = (selector) => h.evaluate((sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '', selector)
const has = (selector) => h.evaluate((sel) => !!document.querySelector(sel), selector)
const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const pageText = () => h.evaluate(() => document.querySelector('.\\@container\\/page')?.textContent?.replace(/\s+/g, ' ') ?? '')
/** Click the first element matching `selector` whose text holds `words`. */
const click = (selector, words) => h.evaluate(([sel, w]) => {
  const hit = [...document.querySelectorAll(sel)].find((one) => (one.textContent ?? '').replace(/\s+/g, ' ').includes(w))
  hit?.click()
  return !!hit
}, [selector, words])
/** A chip whose label rolls in (each letter drawn twice in the text), by its words. */
const chip = (words) => h.evaluate((w) => {
  const hit = [...document.querySelectorAll('button')].find((one) => (one.textContent ?? '').trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ').startsWith(w))
  hit?.click()
  return !!hit
}, words)
const until = async (test, ms = 4000) => { for (let t = 0; t < ms; t += 150) { if (await test()) return true; await wait(150) } return false }

const results = []
const say = (id, verdict, detail = '') => { results.push({ id, verdict }); console.log(`${verdict.padEnd(14)} ${id}${detail ? `  (${detail})` : ''}`) }
const card = async (id, run) => {
  try { await run() } catch (error) { say(id, 'FAIL', `threw: ${String(error?.message ?? error).split('\n')[0]}`) }
}
/** A gem with a question, graded as given, made due now. */
const gem = async (words, prompt, grades = []) => {
  const id = await v('nugget:from', words, {})
  await v('item:save', id, { title: prompt, prompt })
  for (const grade of grades) await v('review:grade', id, grade, 8000)
  if (grades.length) await v('blurt:sooner', [id])
  return id
}
/** Only these cards due in Review, the rest of the morning's out of the way. */
const onlyDue = async (...ids) => { await v('blurt:sooner', ids); for (const one of await v('review:queue')) if (!ids.includes(one.id)) await v('review:bury', one.id) }
const reviewTo = async (prompt) => {
  await go('home')
  await go('review')
  await h.waitForFunction((p) => [...document.querySelectorAll('h2[contenteditable]')].some((one) => one.textContent?.includes(p)), prompt, { timeout: 8000 })
  await blur()
}
const openGem = async (id) => {
  await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
  await send('nugget', id)
  await wait(1500)
}
const today = await h.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })

try {
  await s.electron.evaluate(({ Notification }) => { Notification.prototype.show = function () { globalThis.__said = this.body } })
  await v('onboarding:set', { newsSeen: true, pageHints: false })

  // --- review: graded Good, a card comes back later each time ---------------------------
  await card('review', async () => {
    const id = await gem('Mount Doom is in Mordor', 'Where is Mount Doom?')
    await onlyDue(id)
    await reviewTo('Where is Mount Doom?')
    await h.keyboard.press(' ')
    await wait(500)
    await h.keyboard.press('3')
    await until(async () => (await v('item', id)).reviewed > 0)
    const first = (await v('item', id)).dueAt
    await v('review:grade', id, 3, 8000)
    const second = (await v('item', id)).dueAt
    const gap1 = new Date(first) - Date.now(), gap2 = new Date(second) - Date.now()
    say('review', first && gap2 > gap1 * 1.5 ? 'PASS' : 'FAIL', `Space then 3 in Review; next ${Math.round(gap1 / 864e5)}d, then ${Math.round(gap2 / 864e5)}d`)
  })

  // --- cloze: select a word in the gem, Blank the selected words ---------------------------
  await card('cloze', async () => {
    const id = await gem('The Rosetta Stone was found in 1799 by French soldiers.', 'Rosetta Stone?')
    await openGem(id)
    const picked = await h.evaluate(() => {
      const editor = [...document.querySelectorAll('.tiptap.ProseMirror')].find((one) => one.textContent?.includes('1799'))
      if (!editor) return false
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent.indexOf('1799')
        if (at < 0) continue
        editor.focus()
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + 4)
        getSelection().removeAllRanges()
        getSelection().addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return true
      }
      return false
    })
    await wait(300)
    const clicked = await click('button, [role="button"]', 'Blank the selected words')
    await wait(900)
    const item = await v('item', id)
    say('cloze', picked && clicked && item.prompt?.includes('_____') && !item.prompt.includes('1799') ? 'PASS' : 'FAIL', `prompt now: ${JSON.stringify(item.prompt)}`)
  })

  // --- context: Context and Why, shown after the answer in Review --------------------------
  await card('context', async () => {
    const id = await gem('Do the hard thing first in the morning.', 'When to do the hard thing?')
    await openGem(id)
    const fill = (label, value) => h.evaluate(([l, val]) => {
      const el = document.querySelector(`textarea[aria-label="${l}"]`)
      if (!el) return false
      el.focus()
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.blur()
      return true
    }, [label, value])
    const ok = (await fill('Context', 'Deep Work, Cal Newport')) && (await fill('Why', 'Willpower fades by dusk'))
    await wait(700)
    const item = await v('item', id)
    await onlyDue(id)
    await reviewTo('When to do the hard thing?')
    const before = await pageText()
    await h.keyboard.press(' ')
    await wait(800)
    const after = await pageText()
    const shown = after.includes('Deep Work, Cal Newport') && after.includes('Willpower fades by dusk') && !before.includes('Deep Work, Cal Newport')
    say('context', ok && item.context === 'Deep Work, Cal Newport' && item.why === 'Willpower fades by dusk' && shown ? 'PASS' : 'FAIL', `saved ${JSON.stringify([item.context, item.why])}; after the answer: ${shown}`)
    await v('review:grade', id, 3, 4000)
  })

  // --- readthrough: ⇧⌘R on a list of gems ----------------------------------------------------
  await card('readthrough', async () => {
    await go('nuggets')
    await wait(800)
    await blur()
    await h.keyboard.press('Meta+Shift+R')
    const opened = await until(() => has('[aria-label="Reading"], [data-read-progress]'), 3000)
    const first = await text('[aria-label="Reading"]')
    await h.keyboard.press('j')
    await wait(600)
    const second = await text('[aria-label="Reading"]')
    await h.keyboard.press('Escape')
    await wait(600)
    say('readthrough', opened && first !== second ? 'PASS' : 'FAIL', `⇧⌘R opened: ${opened}; J moved on: ${first !== second}`)
  })

  // --- queue: right-click a note, Add to queue / Read next; G B; Start reading; ] and ⇧→ ----
  await card('queue', async () => {
    const before = (await v('queue')).queue.length
    await go('nuggets')
    await wait(800)
    const row = h.locator('[data-row]').nth(3)
    const name = (await row.textContent()).slice(0, 30)
    await row.click({ button: 'right' })
    await wait(500)
    await h.locator('[role="menuitem"]', { hasText: /^Queue/ }).first().hover()
    await wait(500)
    const added = await click('[role="menuitem"]', 'Add to queue')
    await wait(800)
    const after = (await v('queue')).queue
    await h.keyboard.press('Escape')
    await h.locator('[data-row]').nth(5).click({ button: 'right' })
    await wait(500)
    await h.locator('[role="menuitem"]', { hasText: /^Queue/ }).first().hover()
    await wait(500)
    const nexted = await click('[role="menuitem"]', 'Read next')
    await wait(800)
    const after2 = (await v('queue')).queue
    await h.keyboard.press('Escape')
    await blur()
    await h.keyboard.press('g')
    await h.keyboard.press('b')
    await wait(1200)
    const onQueue = (await h.locator('header h1').first().textContent())?.includes('Queue') || (await has('[data-queue-row]'))
    await click('button', 'Start reading')
    await wait(1200)
    const upNext = await has('[data-up-next]')
    const startLen = (await v('queue')).queue.length
    await h.keyboard.press(']')
    await wait(800)
    const skipLen = (await v('queue')).queue.length
    await h.keyboard.press('Shift+ArrowRight')
    await wait(900)
    const readLen = (await v('queue')).queue.length
    await h.keyboard.press('Escape')
    await wait(500)
    const ok = added && after.length === before + 1 && nexted && after2.length === before + 2 && onQueue && upNext && skipLen === startLen && readLen === startLen - 1
    say('queue', ok ? 'PASS' : 'FAIL', `"${name}": Add to queue ${before}→${after.length}, Read next →${after2.length} (first: ${after2[0]?.title ?? after2[0]?.itemId}); G B on Queue: ${onQueue}; Up next bar: ${upNext}; ] kept ${skipLen}/${startLen}; ⇧→ read one: ${readLen}`)
  })

  // --- wrong: This turned out wrong…, the old one Superseded ---------------------------------
  await card('wrong', async () => {
    const id = await gem('Pluto is the ninth planet of the Sun.', 'How many planets?')
    await openGem(id)
    const opened = await click('button, [role="button"]', 'This turned out wrong')
    await wait(400)
    await h.keyboard.type('Eight; Pluto is a dwarf planet since 2006.')
    await h.keyboard.press('Enter')
    await wait(1000)
    const item = await v('item', id)
    const fresh = item.supersededBy ? await v('item', item.supersededBy) : null
    await go('nuggets')
    await wait(900)
    const marked = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].some((one) => one.textContent?.includes('How many planets?') && one.textContent.includes('Replaced')))
    const due = (await v('review:queue')).some((one) => one.id === id)
    say('wrong', opened && fresh && !due && marked ? 'PASS' : 'FAIL', `new gem: ${JSON.stringify(fresh?.title)}; old out of Review: ${!due}; list says Replaced: ${marked}`)
  })

  // --- suspend: Comes back, Often or Not at all ------------------------------------------------
  await card('suspend', async () => {
    const plain = (await v('items', 'nugget')).find((one) => !one.prompt && !one.suspended && !one.archivedAt)
    await openGem(plain.id)
    const chipsNow = () => h.evaluate(() => ['Now and then', 'Often', 'Not at all', 'In Review, on a schedule'].filter((t) => [...document.querySelectorAll('button')].some((one) => one.textContent?.trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ').startsWith(t))))
    const chips = await chipsNow()
    await chip('Often')
    await wait(700)
    const often = (await v('item', plain.id)).mode
    await chip('Not at all')
    await wait(700)
    const rested = (await v('item', plain.id)).suspended
    // A gem with a question: Review's own schedule, or Not at all; no Often.
    const asked = await gem('Gandalf the Grey becomes the White', 'What colour is Gandalf after Moria?')
    await openGem(asked)
    const askedChips = await chipsNow()
    await chip('Not at all')
    await wait(700)
    const askedRest = (await v('item', asked)).suspended
    const due = (await v('review:queue')).some((one) => one.id === asked)
    await v('item:save', plain.id, { suspended: false, mode: 'encounter' })
    const ok = often === 'pushed' && !!rested && !!askedRest && !due && !askedChips.includes('Often')
    say('suspend', ok ? 'PASS' : 'FAIL', `${ok ? '' : JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent).filter((t) => /Of|Not|Now|Rev/.test(t ?? ''))))} no question: [${chips}] Often→mode ${often}, Not at all→suspended ${rested}; with a question: [${askedChips}], Not at all→suspended ${askedRest}, out of Review ${!due}`)
  })

  // --- questions: open a question, add a clue ----------------------------------------------------
  await card('questions', async () => {
    const q = (await v('items', 'question'))[0]
    await send('question', q.id)
    await wait(1500)
    const found = await h.locator('[aria-label="Add a clue"]').count()
    if (found) {
      await h.locator('[aria-label="Add a clue"]').first().click()
      await wait(600)
      await h.keyboard.type('Gollum takes the ring, not Frodo')
      await h.keyboard.press('Enter')
      await wait(900)
    }
    const after = (await v('items', 'question')).find((one) => one.id === q.id)
    say('questions', found && after.clues === q.clues + 1 ? 'PASS' : 'FAIL', `"${q.title}": clues ${q.clues}→${after.clues}`)
  })

  // --- linecards: question :: answer typed on a line -------------------------------------------------
  await card('linecards', async () => {
    const before = (await v('items', 'card')).filter((one) => !one.archivedAt).length
    await send('day', today)
    await wait(1500)
    const editor = h.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await h.keyboard.press('Meta+ArrowDown')
    await h.keyboard.press('Enter')
    await h.keyboard.type('Capital of Peru :: Lima')
    await wait(2500)
    const cards = (await v('items', 'card')).filter((one) => !one.archivedAt)
    const made = cards.find((one) => one.prompt === 'Capital of Peru')
    const mark = await has('.mf-line-card')
    say('linecards', made && cards.length === before + 1 && mark ? 'PASS' : 'FAIL', `cards ${before}→${cards.length}, asks ${JSON.stringify(made?.prompt)}, mark at the line's end: ${mark}`)
  })

  // --- slipping: the fourth miss, 1 2 3; the Struggling shelf --------------------------------------
  await card('slipping', async () => {
    const id = await gem('Saruman wanted the ring for himself', 'Who betrays the White Council?', [3, 1, 1, 1])
    await onlyDue(id)
    await reviewTo('Who betrays the White Council?')
    await h.keyboard.press(' ')
    await wait(500)
    await h.keyboard.press('1')
    await wait(1000)
    const offer = await text('[data-slipping]')
    const offered = ['This one keeps slipping', 'Rewrite it', 'Split it', 'Pause it'].every((one) => offer.includes(one))
    await h.keyboard.press('3')
    await until(async () => (await v('item', id)).suspended === 1)
    await go('home')
    await go('review')
    await wait(1200)
    const shelf = await text('[data-struggling]')
    say('slipping', offered && (await v('item', id)).suspended === 1 && shelf.includes('Who betrays the White Council?') ? 'PASS' : 'FAIL', `fourth miss offers: ${offered}; 3 set it aside; on the shelf: ${shelf.includes('Who betrays')}`)
  })

  // --- practice: five chips (and Starred), a round of up to ten, nothing moved unless graded -----
  await card('practice', async () => {
    await go('review')
    await wait(1200)
    // The rounds sit folded under “Practise”.
    await h.evaluate(() => document.querySelector('[data-practise]')?.click())
    await wait(600)
    const chips = await h.evaluate(() => [...document.querySelectorAll('[data-focus-chips] button')].filter((one) => !one.hasAttribute('data-learn-new')).map((one) => one.textContent?.trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ')))
    const before = Object.fromEntries((await v('items', 'nugget')).map((one) => [one.id, one.dueAt]))
    const round = await v('review:round', 'new')
    await h.evaluate(() => [...document.querySelectorAll('[data-focus-chips] button')].find((one) => /^New \d/.test(one.textContent?.trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ') ?? ''))?.click())
    await wait(1200)
    const extra = (await pageText()).includes('An extra round')
    await blur()
    await h.keyboard.press('b')
    await wait(600)
    const after = Object.fromEntries((await v('items', 'nugget')).map((one) => [one.id, one.dueAt]))
    const still = Object.keys(before).every((id) => before[id] === after[id])
    await click('button', 'Back to today’s cards')
    await wait(800)
    // Only rounds with cards in them are offered, in their order: the five, then Starred.
    const order = ['Weak spots', 'Finish learning', 'Revive old', 'Keep fresh', 'New', 'Starred']
    const at = chips.map((chip) => order.findIndex((one) => chip.startsWith(one)))
    const five = chips.length > 0 && at.every((one, i) => one >= 0 && (i === 0 || one > at[i - 1])) && chips.every((chip) => !/ 0(\D|$)/.test(chip))
    say('practice', five && round.length <= 10 && extra && still ? 'PASS' : 'FAIL', `${chips.length} rounds with cards, in order: ${five} ${five ? '' : JSON.stringify(chips)}; New round of ${round.length}; extra round: ${extra}; skipping moved nothing: ${still}`)
  })

  // --- blurt: five minutes on a tag; the missed ones lit and sooner; kept on today's page ---------
  await card('blurt', async () => {
    await send('tag', 'astrophysics')
    await wait(1500)
    await h.evaluate(() => document.querySelector('[data-blurt-open]')?.click())
    await wait(900)
    const writing = await text('[data-blurt="writing"]')
    const clock = /[45]:\d\d/.exec(writing)?.[0]
    await h.focus('[data-blurt="writing"] textarea')
    await h.keyboard.type('Event horizon: where light cannot escape.', { delay: 3 })
    await h.keyboard.press('Meta+Enter')
    await wait(1500)
    const lit = await h.evaluate(() => document.querySelectorAll('[data-missed]').length)
    const page = await v('notes:day', today)
    const kept = JSON.stringify(page?.body ?? '').includes('Blurt on #astrophysics')
    say('blurt', clock && lit > 0 && kept ? 'PASS' : 'FAIL', `clock ${clock}; left out, lit: ${lit}; kept on today's page: ${kept}`)
    await h.keyboard.press('Escape')
  })

  // --- reviewreminder: the setting, what the notification says, quiet hours, none due --------------
  await card('reviewreminder', async () => {
    await h.evaluate(() => localStorage.setItem('settings:section', 'Review'))
    await go('home')
    await go('settings')
    await wait(1200)
    const setting = await h.evaluate(() => [...document.querySelectorAll('[data-setting]')].some((one) => one.textContent?.includes('Review reminder') && one.querySelector('input[type="time"], button')))
    const now = new Date()
    const at = new Date(now.getTime() - 60000).toTimeString().slice(0, 5)
    await v('settings:set', { quietStart: new Date(now.getTime() - 3600000).toTimeString().slice(0, 5), quietEnd: new Date(now.getTime() + 3600000).toTimeString().slice(0, 5), reviewReminder: at })
    const quiet = await v('review:reminder:now')
    await v('settings:set', { quietStart: '03:00', quietEnd: '03:01' })
    const said = (await v('review:reminder:now')) ?? (await s.electron.evaluate(() => globalThis.__said ?? null))
    await v('settings:set', { reviewReminder: null })
    const ok = setting && quiet === null && /^\d+ cards?, about \d+ minutes?$/.test(said ?? '')
    say('reviewreminder', ok ? 'CHECKED-PARTLY' : 'FAIL', `setting in Settings, Review: ${setting}; in quiet hours: ${quiet}; says "${said}" (the clock time itself not waited for; silent-when-none is in qa/study.mjs)`)
  })

  // --- learnvigil: the deck, about twenty, tagged #learn-vigil ------------------------------------------
  await card('learnvigil', async () => {
    const count = await v('learn:count')
    const again = await v('learn:add')
    await go('powers')
    await wait(1200)
    const offer = await has('[data-learn]')
    const fresh = (await v('items', 'nugget')).filter((one) => String(one.body ?? '').includes('#learn-vigil') || one.title).length
    const perDay = (await v('settings')).newPerDay
    say('learnvigil', count >= 18 && count <= 26 && again === 0 && offer ? 'PASS' : 'FAIL', `${count} cards tagged #learn-vigil (sandbox has it added); a second add adds ${again}; offered on this page: ${offer}; new cards a day: ${perDay} (shared with all new cards, so "a few a day")`)
    void fresh
  })

  // --- learnmode: Learn under the chips, choices then written, 1-4 --------------------------------------
  await card('learnmode', async () => {
    await go('home')
    await go('review')
    await wait(1200)
    const line = await h.evaluate(() => document.querySelector('[data-learn-new]')?.textContent ?? '')
    await h.evaluate(() => document.querySelector('[data-learn-new]')?.click())
    await wait(1000)
    const open = await has('[data-learn-mode]')
    const choices = await h.evaluate(() => document.querySelectorAll('[data-choices] button').length)
    let typedSeen = false
    let bar = await has('[data-learn-mode] [role="progressbar"], [data-learn-mode] [aria-valuenow]')
    for (let i = 0; i < 40 && !(await has('[data-learn-done]')); i++) {
      if (await has('[data-choices]')) {
        await h.keyboard.press('1')
      } else {
        typedSeen = true
        await h.focus('[data-learn-mode] input')
        await h.keyboard.type('x')
        await h.keyboard.press('Enter')
      }
      await wait(200)
      await h.keyboard.press('Enter')
      await wait(200)
      if (typedSeen) break
    }
    await h.keyboard.press('Escape')
    await wait(600)
    say('learnmode', /Learn \d+ new/.test(line) && open && choices >= 2 && choices <= 4 && typedSeen ? 'PASS' : 'FAIL', `line "${line.slice(0, 70)}"; ${choices} choices on keys 1-${choices}; then written out: ${typedSeen}; a bar: ${bar}`)
  })

  // --- typed / star / howitdecides on one card ----------------------------------------------------
  const peru = await gem('Lima, on the Pacific coast', 'Capital of Peru?', [3])
  await card('star', async () => {
    await onlyDue(peru)
    await reviewTo('Capital of Peru?')
    await h.keyboard.press('s')
    await wait(700)
    await h.evaluate(() => document.querySelector('[data-practise]')?.click())
    await wait(600)
    const chips = await h.evaluate(() => [...document.querySelectorAll('[data-focus-chips] button')].map((one) => one.textContent?.trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ')))
    const round = await v('review:round', 'starred')
    say('star', !!(await v('item', peru)).starredAt && /^Starred/.test(chips.at(-1) ?? '') && round.some((one) => one.id === peru) ? 'PASS' : 'FAIL', `S starred it; last chip Starred: ${/^Starred/.test(chips.at(-1) ?? '')}; Starred round holds it: ${round.some((one) => one.id === peru)}`)
  })
  await card('typed', async () => {
    const glosses = (await v('glosses', peru)).length
    await h.focus('textarea')
    await h.keyboard.type('Lima on the coast')
    await h.keyboard.press('Meta+Enter')
    await wait(900)
    const said = await text('[data-typed]')
    await card('howitdecides', async () => {
      await h.evaluate(() => document.querySelector('[data-how] summary')?.click())
      await wait(900)
      const how = await text('[data-how]')
      say('howitdecides', how.includes('aims for you to still know') && how.includes('Good brings it back') ? 'PASS' : 'FAIL', how.slice(0, 120))
    })
    await blur()
    await h.keyboard.press('3')
    await wait(900)
    const kept = (await v('glosses', peru)).length === glosses + 1
    say('typed', /About \d+% the same: that suggests (Again|Hard|Good|Easy)/.test(said) && kept ? 'PASS' : 'FAIL', `"${said.slice(0, 70)}"; kept as a thought: ${kept}`)
  })

  // --- practisetag: Practise on a tag, Space, J, K, nothing scheduled ---------------------------
  await card('practisetag', async () => {
    const due = Object.fromEntries((await v('tag:cards', 'learn-vigil')).map((one) => [one.id, one.dueAt]))
    await send('tag', 'learn-vigil')
    await wait(1500)
    await h.evaluate(() => document.querySelector('[data-practise-open]')?.click())
    await wait(900)
    const opened = (await text('[data-practise]')).includes('Nothing here is counted or scheduled')
    await blur()
    await h.keyboard.press(' ')
    await wait(500)
    const answer = await has('[data-practise-answer]')
    await h.keyboard.press('j')
    await wait(500)
    const two = (await text('[data-practise]')).includes('2 of')
    await h.keyboard.press('k')
    await wait(500)
    const one = (await text('[data-practise]')).includes('1 of')
    const after = Object.fromEntries((await v('tag:cards', 'learn-vigil')).map((row) => [row.id, row.dueAt]))
    const still = Object.keys(due).every((id) => due[id] === after[id])
    await h.keyboard.press('Escape')
    say('practisetag', opened && answer && two && one && still ? 'PASS' : 'FAIL', `opened ${opened}; Space answer ${answer}; J on ${two}; K back ${one}; nothing scheduled ${still}`)
  })

  // --- tagpriority: Manage, Learning / Maintaining / Paused ---------------------------------------
  await card('tagpriority', async () => {
    const known = await gem('Mercury is closest to the Sun #moons', 'Closest planet?', [3])
    await gem('Io has volcanoes #moons', 'Moon with volcanoes?')
    await v('blurt:sooner', [known])
    const queue = async () => (await v('review:queue')).map((one) => one.prompt)
    await send('tag', 'moons')
    await wait(1500)
    await click('[role="tab"]', 'Manage')
    await wait(800)
    const labels = await h.evaluate(() => [...document.querySelectorAll('[data-tag-priority] button')].map((one) => one.textContent?.trim().replace(/(.)\1/g, '$1').replace(/\s+/g, ' ')))
    await h.evaluate(() => document.querySelectorAll('[data-tag-priority] button')[2]?.click())
    await wait(800)
    const paused = await queue()
    await h.evaluate(() => document.querySelectorAll('[data-tag-priority] button')[1]?.click())
    await wait(800)
    const kept = await queue()
    await v('tag:set', 'moons', { priority: null })
    const ok = !paused.includes('Closest planet?') && !paused.includes('Moon with volcanoes?') && kept.includes('Closest planet?') && !kept.includes('Moon with volcanoes?')
    say('tagpriority', ok ? 'PASS' : 'FAIL', `chips [${labels}]; Paused: none due; Maintaining: the reviewed one due, the new one not`)
  })

  // --- listcards: paste term - meaning lines, Make cards --------------------------------------------
  await card('listcards', async () => {
    await send('day', today)
    await wait(1500)
    await h.evaluate(() => {
      const target = document.querySelector('.tiptap.ProseMirror')
      target?.focus()
      const data = new DataTransfer()
      data.setData('text/plain', 'Ephemeral - lasting a very short time\nLaconic - using few words\nSanguine - hopeful in a bad time')
      target?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await wait(1200)
    const offered = await click('button', 'Make 3 cards')
    await wait(900)
    const made = (await v('items', 'nugget')).filter((one) => ['Ephemeral', 'Laconic', 'Sanguine'].includes(one.prompt))
    say('listcards', offered && made.length === 3 ? 'PASS' : 'FAIL', `toast offered Make 3 cards: ${offered}; cards made: ${made.length}`)
  })

  // --- strength: a reviewed gem's dated grades and its line ------------------------------------------
  await card('strength', async () => {
    await openGem(peru)
    await h.evaluate(() => document.querySelector('[data-strength]')?.scrollIntoView({ block: 'center' }))
    await wait(500)
    const line = await has('[data-strength] polyline')
    const history = await v('review:strength', peru)
    const near = await h.evaluate(() => document.querySelector('[data-strength]')?.closest('section, [data-island], div')?.parentElement?.textContent?.slice(0, 200) ?? '')
    say('strength', line && history.length >= 2 && history.every((one) => one.at && one.grade && one.days > 0) ? 'PASS' : 'FAIL', `${history.length} dated grades, days held ${history.map((one) => one.days).join(' → ')}; line drawn: ${line}`)
    void near
  })

  // --- fit: Settings, Review, Fit now after a thousand reviews --------------------------------------
  await card('fit', async () => {
    await h.evaluate(() => localStorage.setItem('settings:section', 'Review'))
    await go('home')
    await go('settings')
    await wait(1200)
    const waiting = await text('[data-fit]')
    const disabled = await h.evaluate(() => [...document.querySelectorAll('[data-fit] button')].some((one) => one.textContent?.includes('Fit now') && one.disabled))
    const state = await v('review:fit:state')
    for (let i = state.reviews; i < 1000; i += 50) await h.evaluate(async ([id, n]) => { for (let k = 0; k < n; k++) await window.api.vigil('review:grade', id, 3, 4000) }, [peru, 50])
    await go('home')
    await go('settings')
    await wait(1200)
    const clicked = await click('[data-fit] button', 'Fit now')
    await wait(1200)
    const fitted = await text('[data-fit]')
    await v('settings:set', { fsrsFirst: null })
    say('fit', disabled && /of 1,000 reviews/.test(waiting) && clicked && fitted.includes('Fitted') ? 'PASS' : 'FAIL', `before: "${waiting}" (button off: ${disabled}); after: "${fitted}"`)
  })

  // --- every card's Show me ----------------------------------------------------------------------
  const ids = ['review', 'cloze', 'context', 'readthrough', 'queue', 'wrong', 'suspend', 'questions', 'linecards', 'slipping', 'practice', 'blurt', 'reviewreminder', 'learnvigil', 'learnmode', 'typed', 'practisetag', 'star', 'howitdecides', 'tagpriority', 'listcards', 'strength', 'fit', 'daysinarow']
  for (const id of ids) {
    await card(`show:${id}`, async () => {
      await go('home')
      await go('powers')
      await wait(600)
      const box = h.locator(`[data-power="${id}"]`)
      await box.scrollIntoViewIfNeeded()
      await h.evaluate(() => { window.__toasts = []; if (!window.__listening) { window.__listening = true; addEventListener('vigil:toast', (event) => window.__toasts.push(event.detail.text)) } })
      await box.getByRole('button', { name: /Show me/ }).click()
      await wait(3200)
      const title = (await h.locator('header h1').first().textContent().catch(() => ''))?.trim()
      const pointed = await h.evaluate(() => { const el = document.querySelector('[data-pointed]'); return el && el.getBoundingClientRect().width > 0 ? (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 60) : null })
      const dialog = await has('[role="dialog"][aria-label="Where things are"]')
      const toastSaid = await h.evaluate(() => (window.__toasts ?? []).join(' | ').slice(0, 90))
      const aims = await h.evaluate((power) => !!power, id)
      void aims
      const ok = (dialog && pointed) || (!pointed && toastSaid)
      say(`show:${id}`, ok ? 'PASS' : 'FAIL', `page "${title}", ${pointed ? `pointed at "${pointed}"` : `toast "${toastSaid}"`}`)
      await h.keyboard.press('Escape')
      await wait(300)
      await h.evaluate(() => document.querySelectorAll('[data-pointed]').forEach((one) => one.removeAttribute('data-pointed')))
    })
  }

  // --- daysinarow: hidden at one day; at two, under the chips. Tomorrow is
  // made by moving the main process's clock on a day, then reviewing once more.
  await card('daysinarow', async () => {
    const days = await v('review:days')
    await go('home')
    await go('review')
    await wait(1200)
    const hidden = !(await has('[data-days-in-a-row]'))
    await s.electron.evaluate(() => {
      const Real = Date
      class Tomorrow extends Real {
        constructor(...args) { if (args.length) super(...args); else super(Real.now() + 864e5) }
        static now() { return Real.now() + 864e5 }
      }
      globalThis.Date = Tomorrow
    })
    const id = (await v('items', 'nugget')).find((one) => one.prompt && !one.suspended && !one.supersededBy)?.id
    await v('review:grade', id, 3, 4000)
    const next = await v('review:days')
    await go('home')
    await go('review')
    await wait(1500)
    const line = await text('[data-days-in-a-row]')
    // In the line over the card, or under what the Done screen says.
    const under = await h.evaluate(() => !!document.querySelector('[data-review-top] [data-days-in-a-row], [data-review-finished] [data-days-in-a-row]'))
    say('daysinarow', days.run === 1 && hidden && next.run === 2 && /^2 days in a row/.test(line) && under ? 'PASS' : 'FAIL', `today ${days.run} day, hidden: ${hidden}; a review tomorrow: ${next.run}, "${line}" in its place: ${under}; the rest-day rule is daysInARow() in src/main/study.ts, test/study.test.ts`)
  })
  const errors = s.errors.filter((one) => one.includes('PAGEERROR'))
  if (errors.length) say('page errors', 'FAIL', errors.join(' | ').slice(0, 300))
} finally {
  await s.close()
}
const failed = results.filter((one) => one.verdict === 'FAIL')
console.log(`${results.length - failed.length} of ${results.length} passed or checked${failed.length ? `; failed: ${failed.map((one) => one.id).join(', ')}` : ''}`)
process.exit(failed.length ? 1 : 0)
