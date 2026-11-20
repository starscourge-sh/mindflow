// A meeting can't be broken by typing: every way a person might (on purpose or not) tried on a recorded meeting's page.
// ⌫ and Delete with the pointer on a time, on a speaker and between lines; ⌘A then ⌫, and ⌘A then a letter; ⌫ at the
// start of the notes under it; cut and paste of transcript into another note (plain quoted lines with their times);
// a line dragged; undo and redo across them; "Fix this line" (double-click and the right-click menu) changing only
// the words; a speaker renamed while it plays; the recording deleted, the words kept; the note duplicated, binned and
// restored; and a meeting kept the old way (its lines open in the note) folded in with every word.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/meeting-unbreakable.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'

const FRAMES = process.env.FRAMES
const { check, done } = checks()
const { c, made, record } = await recorded()
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const state = () => h.evaluate(() => ({
  meetings: document.querySelectorAll('[data-open] [data-meeting-page]').length,
  lines: [...document.querySelectorAll('[data-meeting-line]')].map((el) => `${el.dataset.who}|${el.dataset.at}|${el.querySelector('.mf-meeting-words').textContent}`)
}))
const same = (a, b) => a.meetings === 1 && b.meetings === 1 && a.lines.join('\n') === b.lines.join('\n')
const shot = async (name) => FRAMES && h.screenshot({ path: join(FRAMES, `${name}.png`) })

try {
  const id = await record()
  check('a meeting is recorded to its page', !!id)
  const start = await state()
  check('every line said is on the page', start.lines.length === made.lines.length, `${start.lines.length} of ${made.lines.length}`)
  check('the transcript is not typed into: no line is editable text', await h.evaluate(() => [...document.querySelectorAll('[data-meeting-line]')].every((el) => !el.isContentEditable)))

  // ⌫ and Delete with the pointer on a time, a speaker, and between lines.
  await h.locator('[data-meeting-line] .mf-meeting-time').nth(2).click()
  await h.evaluate(() => document.querySelector('[data-meeting-page] audio')?.pause())
  console.log('after click', JSON.stringify(await state()).slice(0, 80), await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)))
  for (const key of ['Backspace', 'Backspace', 'Delete', 'Delete']) { await h.keyboard.press(key); await wait(150); console.log(key, (await state()).lines.length) }
  await shot('after-keys')
  await wait(200)
  const afterTime = await state()
  check('⌫ and Delete after clicking a time change nothing', same(start, afterTime), JSON.stringify({ m: afterTime.meetings, n: afterTime.lines.length, html: await h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').innerHTML.slice(0, 300)) }))
  await h.locator('[data-meeting-line] [data-speaker]').nth(1).click()
  await wait(250)
  console.log('popover', !!(await h.$('[data-meeting-naming]')))
  await h.keyboard.press('Escape')
  await wait(200)
  console.log('after esc', (await state()).lines.length, await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 100)))
  for (const key of ['Backspace', 'Delete']) { await h.keyboard.press(key); await wait(200); console.log('k', key, (await state()).lines.length, await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)), (await h.evaluate((one) => window.api.captures.get(one), id))?.status) }
  await wait(200)
  const afterName = await state()
  check('⌫ and Delete after clicking a speaker change nothing', same(start, afterName), JSON.stringify({ m: afterName.meetings, diff: afterName.lines.filter((one, n) => one !== start.lines[n]) }))
  const gap = await h.evaluate(() => { const a = document.querySelectorAll('[data-meeting-line]')[3].getBoundingClientRect(); return { x: a.left + 40, y: a.bottom + 1 } })
  await h.mouse.click(gap.x, gap.y)
  for (const key of ['Backspace', 'Delete', 'Backspace']) await h.keyboard.press(key)
  await wait(200)
  check('⌫ and Delete between lines change nothing', same(start, await state()))

  // The notes under the meeting: ⌫ at their start never reaches it; typing there is ordinary writing.
  const notes = h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain) > p').last()
  await notes.click()
  await h.keyboard.press('Home')
  for (let i = 0; i < 4; i += 1) await h.keyboard.press('Backspace')
  await wait(200)
  check('⌫ at the start of the notes under it leaves the meeting whole', same(start, await state()))
  await h.keyboard.type('My own note about it')
  await wait(300)
  check('the notes under it take typing as any note does', await h.evaluate(() => [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) > p')].some((p) => p.textContent === 'My own note about it')))

  // Past the editor's moment for joining keystrokes into one undo step, as a person pauses.
  await wait(800)
  // ⌘A then ⌫; ⌘A then a letter: the rest goes, the meeting stays; ⌘Z puts it all back.
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Meta+a')
  console.log('sel', await h.evaluate(() => ({ active: document.activeElement?.className?.slice?.(0, 60), sel: getSelection().toString().slice(0, 40) })))
  await h.keyboard.press('Backspace')
  await wait(400)
  console.log('wiped', await h.evaluate(() => document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.innerHTML.slice(0, 200)))
  const wiped = await state()
  check('⌘A then ⌫: the meeting stays whole', same(start, wiped), JSON.stringify({ meetings: wiped.meetings, lines: wiped.lines.length }))
  check('and what else was picked goes, as asked (the note under it)', await h.evaluate(() => ![...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].some((p) => p.textContent === 'My own note about it')))
  await shot('select-all-delete')
  await h.keyboard.press('Meta+z')
  await wait(400)
  console.log('undo', await h.evaluate(() => ({ active: document.activeElement?.className?.slice?.(0, 60), html: document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)')?.innerHTML.replace(/<div data-meeting-page[\s\S]*?data-meeting-transcript[\s\S]*$/, '[meeting]').slice(0, 400) })))
  check('⌘Z after it brings the note back', await h.evaluate(() => [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) p')].some((p) => p.textContent === 'My own note about it')))
  check('and the meeting is still the one meeting, whole', same(start, await state()))
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Meta+a')
  await h.keyboard.type('x')
  await wait(300)
  check('⌘A then a letter: the meeting stays whole', same(start, await state()))
  await h.keyboard.press('Meta+z'); await wait(300)
  await h.keyboard.press('Meta+Shift+z'); await wait(300)
  check('redo and undo again leave it whole', same(start, await state()))
  await h.keyboard.press('Meta+z'); await wait(300)

  // Copy and cut of transcript lines: plain quoted lines with their times; cut leaves the transcript as it was.
  const pick = async (from, to) => h.evaluate(([a, b]) => {
    const rows = document.querySelectorAll('[data-meeting-line] .mf-meeting-words')
    const range = document.createRange()
    range.setStart(rows[a].firstChild, 0)
    range.setEnd(rows[b].firstChild, rows[b].textContent.length)
    getSelection().removeAllRanges(); getSelection().addRange(range)
  }, [from, to])
  await pick(1, 2)
  await wait(150)
  const copied = await h.evaluate(() => { let text = ''; const data = new DataTransfer(); const e = new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }); getSelection().anchorNode.parentElement.dispatchEvent(e); text = data.getData('text/plain'); return { text, html: data.getData('text/html'), stopped: e.defaultPrevented } })
  check('copied lines are plain lines with their times and speakers', /^\[0:0\d\] Speaker \d: .+\n\[0:0\d\] You: .+$/.test(copied.text) && copied.stopped, copied.text)
  check('and as quoted lines for a note', copied.html.startsWith('<blockquote><p>[0:'), copied.html.slice(0, 80))
  await pick(1, 2)
  await h.keyboard.press('Meta+x')
  await wait(300)
  check('⌘X on transcript lines takes nothing out of the meeting', same(start, await state()))

  // Pasted into another note: quoted lines, never a half meeting.
  const other = await h.evaluate(() => window.api.captures.create({ title: 'Somewhere else', kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await c.send('capture', other); await wait(1200)
  await h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain)').first().click()
  await h.evaluate((html) => { const data = new DataTransfer(); data.setData('text/html', html); data.setData('text/plain', 'x'); document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, copied.html)
  await wait(400)
  const pasted = await h.evaluate(() => ({ meeting: !!document.querySelector('[data-open] [data-meeting-page]'), quote: document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain) blockquote')?.textContent ?? '' }))
  check('pasted into another note: quoted lines with their times, no meeting', !pasted.meeting && /\[0:0\d\] Speaker \d: /.test(pasted.quote), JSON.stringify(pasted))
  // The whole meeting copied as a block (⌘A, ⌘C) and pasted: its lines as a quote, never a second meeting.
  await c.send('capture', id); await wait(1200)
  const whole = await h.evaluate(() => { const meeting = document.querySelector('[data-meeting-page]').closest('[data-meeting]') ?? document.querySelector('[data-meeting-page]').parentElement; return meeting ? null : null })
  void whole
  const html = await h.evaluate(() => { const s = getSelection(); s.removeAllRanges(); document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').focus(); return null })
  void html
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Meta+a')
  const all = await h.evaluate(() => { const data = new DataTransfer(); document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true })); return data.getData('text/html') })
  await c.send('capture', other); await wait(1200)
  await h.locator('[data-open] .tiptap:not(.is-line):not(.is-plain)').first().click()
  await h.evaluate((html) => { const data = new DataTransfer(); data.setData('text/html', html); data.setData('text/plain', 'x'); document.querySelector('[data-open] .tiptap:not(.is-line):not(.is-plain)').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })) }, all)
  await wait(400)
  const pastedAll = await h.evaluate(() => ({ meeting: document.querySelectorAll('[data-open] [data-meeting-page]').length, quoted: [...document.querySelectorAll('[data-open] .tiptap:not(.is-line):not(.is-plain) blockquote p')].length }))
  check('the whole page copied and pasted elsewhere: its lines quoted, no second meeting', pastedAll.meeting === 0 && pastedAll.quoted >= made.lines.length, JSON.stringify(pastedAll))
  await c.send('capture', id); await wait(1200)

  // A line dragged: nothing moves in the meeting.
  const dragged = await h.evaluate(() => { const row = document.querySelectorAll('[data-meeting-line]')[2]; getSelection().removeAllRanges(); const e = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }); row.querySelector('.mf-meeting-words').dispatchEvent(e); return e.defaultPrevented })
  check('a line dragged with nothing picked does not move', dragged && same(start, await state()))

  // Fix this line: a double-click opens its words; Return keeps the change; its time and voice stay; ⌘Z undoes it.
  const target = h.locator('[data-meeting-line] .mf-meeting-words').nth(4)
  await target.dblclick()
  await h.waitForSelector('[data-meeting-fix]', { timeout: 3000 })
  await shot('fix-line')
  await h.keyboard.press('Meta+a'); await h.keyboard.type('Yes, I will add them to the shared folder today.'); await h.keyboard.press('Enter')
  await wait(400)
  const fixed = await state()
  const before4 = start.lines[4].split('|'), after4 = fixed.lines[4].split('|')
  check('"Fix this line" changes only that line\'s words', after4[2] === 'Yes, I will add them to the shared folder today.' && fixed.lines.filter((one, n) => one !== start.lines[n]).length === 1, fixed.lines[4])
  check('its time and speaker stay', after4[0] === before4[0] && after4[1] === before4[1])
  check('a double-click does not leave it playing', await h.evaluate(() => document.querySelector('[data-meeting-page] audio').paused))
  await h.keyboard.press('Meta+z'); await wait(400)
  check('⌘Z undoes the fix', same(start, await state()))
  await h.keyboard.press('Meta+Shift+z'); await wait(400)
  check('⌘⇧Z does it again', (await state()).lines[4].endsWith('shared folder today.'))
  await h.keyboard.press('Meta+z'); await wait(300)
  // Esc leaves it as it was.
  await target.dblclick(); await h.waitForSelector('[data-meeting-fix]')
  await h.keyboard.type('nonsense'); await h.keyboard.press('Escape'); await wait(300)
  check('Esc leaves the line as it was', same(start, await state()))
  // From the right-click menu: "Fix this line"; never Delete or Duplicate on a meeting.
  await h.locator('[data-meeting-line] .mf-meeting-words').nth(1).click({ button: 'right' })
  await wait(400)
  const menu = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] .tiptap-slash-menu-title')].map((el) => el.textContent))
  await shot('line-menu')
  check('right-click on a line offers "Fix this line"', menu.includes('Fix this line'), menu.join(', '))
  check('and no Delete or Duplicate for the meeting', !menu.includes('Delete') && !menu.includes('Duplicate'), menu.join(', '))
  await h.click('[data-meeting-fix-line]')
  check('which opens that line\'s words', !!(await h.waitForSelector('[data-meeting-line]:nth-child(2) [data-meeting-fix]', { timeout: 3000 }).catch(() => null)))
  await h.keyboard.press('Escape'); await wait(200)

  // A speaker renamed while it plays: every line takes the name; the playing goes on.
  await h.locator('[data-meeting-line] .mf-meeting-time').first().click()
  await wait(300)
  const who = await h.evaluate(() => document.querySelector('[data-meeting-line]:not([data-who="you"])').dataset.who)
  await h.click(`[data-meeting-voice="${who}"]`)
  await h.waitForSelector('[data-meeting-naming] input')
  await h.keyboard.type('Marco'); await h.keyboard.press('Enter'); await wait(400)
  const renamed = await h.evaluate((w) => ({ names: [...document.querySelectorAll(`[data-meeting-line][data-who="${w}"] [data-speaker]`)].map((el) => el.textContent), playing: !document.querySelector('[data-meeting-page] audio').paused }), who)
  check('renamed while it plays: every line of that voice takes the name, and it goes on playing', renamed.names.every((one) => one === 'Marco') && renamed.playing, JSON.stringify(renamed))
  await h.evaluate(() => document.querySelector('[data-meeting-page] audio').pause())

  // The recording deleted, the words kept.
  await h.click('[data-meeting-page] [data-meeting-voices]', { button: 'right' }); await wait(300)
  await h.click('[data-meeting-drop-audio]'); await wait(400)
  check('the recording deleted, every word kept', !(await h.$('[data-meeting-page] [data-wave]')) && (await state()).lines.length === made.lines.length)
  await h.keyboard.press('Meta+z'); await wait(400)

  // Duplicated, binned and restored: the meeting whole each time.
  const body = (await h.evaluate((one) => window.api.captures.get(one), id)).body
  const copy = await h.evaluate((b) => window.api.captures.create({ title: 'A copy', kind: 'note', body: b }), body)
  await c.send('capture', copy); await wait(1500)
  check('the note duplicated: the copy holds the whole meeting', (await state()).lines.length === made.lines.length)
  await h.evaluate((one) => window.api.captures.save(one, { status: 'discarded' }), id)
  await h.evaluate((one) => window.api.captures.save(one, { status: 'open' }), id)
  await c.send('capture', id); await wait(1500)
  check('binned and restored: the meeting whole', (await state()).lines.length === made.lines.length && (await state()).meetings === 1)

  // A meeting kept the old way: its lines folded into it, every word kept, and saved so.
  const old = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Old meeting' }] }, { type: 'meeting', attrs: { audio: '', seconds: 30, startedAt: '2026-11-01T09:00:00.000Z', speakers: ['s1'], names: {} } },
    ...made.lines.map((one) => ({ type: 'meetingLine', attrs: { who: one.who === 'you' ? 'you' : 's1', at: one.start, end: one.end }, content: [{ type: 'text', text: one.text }] })), { type: 'paragraph' }] }
  const was = await h.evaluate((b) => window.api.captures.create({ title: 'Old meeting', kind: 'note', body: b }), old)
  await c.send('capture', was); await wait(1800)
  const folded = await state()
  check('a meeting kept before this change opens whole: every word, in order', folded.meetings === 1 && folded.lines.map((one) => one.split('|')[2]).join('\n') === made.lines.map((one) => one.text).join('\n'), `${folded.lines.length} lines`)
  await wait(1500)
  const stored = (await h.evaluate((one) => window.api.captures.get(one), was)).body
  const shape = (typeof stored === 'string' ? JSON.parse(stored) : stored).content.map((one) => one.type)
  check('and is kept the new way', !shape.includes('meetingLine'), shape.join(','))
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 4).join(' / '))
} finally {
  await c.close()
  done()
}
