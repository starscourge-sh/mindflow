// An older recording read again as it opens (the user, 17 Nov: nine voices for one person speaking, and "tell the
// same" as an action item). Run on a COPY of the user's book (QA_DATA), never the book: its "Recording, 8 Nov at
// 15:28" is opened.
//   PART=voices (the default): its voices settle at once as a new recording's do (a voice in under 5% of the lines
//     folded into the nearest: 8 speakers become 4), said in a notice whose Undo puts the 8 back, and it is not
//     done again on the next open.
//   PART=ai: where this Mac has Apple Intelligence, it reads the lines and its notice says what it found, the action
//     items now its own; its Undo puts the lines found by rule back. Without it, the rule's items stay, unsaid.
//   cp -cR <book> <copy> && PART=voices QA_DATA=<copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=/abs/dir] node qa/meeting-read-again.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
if (!process.env.QA_DATA) throw new Error('QA_DATA must be a copy of the book')
const PART = process.env.PART ?? 'voices'
const c = await sandbox({ width: 1280, height: 900, seeded: false })
const { electron, h, send, both, errors } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const meetingOf = async (id) => {
  const body = JSON.parse((await sql('select body from captures where id = ?', id))[0].body)
  const find = (n) => (n?.type === 'meeting' ? n : (n?.content ?? []).map(find).find(Boolean))
  return find(body)?.attrs
}
const voices = () => h.evaluate(() => [...document.querySelectorAll('[data-meeting-voice]')].map((one) => one.textContent.trim()))
const notice = (words, ms) => h.waitForFunction((w) => (window.__said ?? []).some((one) => one.includes(w)), words, { timeout: ms }).then(() => true, () => false)
const undo = (words) => h.locator('[data-sonner-toast], [role=status]', { hasText: words }).locator('button', { hasText: 'Undo' }).first().click()
try {
  const id = (await sql("select id from captures where body like '%Recording, 8 Nov at 15:28%'"))[0]?.id
  check('the copy holds the 8 Nov recording', !!id)
  const was = await meetingOf(id)
  console.log(`before: ${was.speakers.length} speakers, ${was.actions.length} items by ${[...new Set(was.actions.map((one) => one.by))].join(',')}, read by Apple Intelligence: ${!!was.take}`)
  // Every notice from here on, as it comes: one may take the place of another.
  await h.evaluate(() => { window.__said = []; new MutationObserver(() => { for (const one of document.querySelectorAll('[data-sonner-toast], [role=status]')) { const t = one.textContent ?? ''; if (!window.__said.includes(t)) window.__said.push(t) } }).observe(document.body, { childList: true, subtree: true, characterData: true }) })
  await send('capture', id)
  await h.waitForSelector('[data-meeting-voices]', { timeout: 15000 })
  if (PART === 'voices') {
    check('a notice says at once that the voices were settled', await notice('speakers in this recording, not 8', 15000), JSON.stringify(await h.evaluate(() => window.__said)))
    check('4 speakers, not 8, every line still there', (await voices()).length === 5 && (await meetingOf(id)).lines.length === was.lines.length, JSON.stringify(await voices()))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/q1-meeting-voices.png` })
    await undo('speakers in this recording')
    await h.waitForTimeout(1200)
    const back = await meetingOf(id)
    check('Undo puts the 8 speakers back', back.speakers.length === was.speakers.length && (await voices()).length === 9, JSON.stringify(await voices()))
    check('and it is marked, so the next open does not settle them again', !!back.readAgain)
  } else {
    // Apple Intelligence reads an hour in parts: minutes on a busy Mac.
    const read = await notice('Apple Intelligence read this recording', 300000)
    const now = await meetingOf(id)
    console.log(`after: ${now.speakers.length} speakers; items: ${now.actions.map((one) => `${one.text} (${one.by})`).join(' | ') || 'none'}; read: ${!!now.take}`)
    if (read) {
      check('Apple Intelligence\'s notice says what it found', true)
      check('the action items are its own now', !!now.take && now.actions.every((one) => one.by === 'ai' || one.done || one.task))
      if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/q1-meeting-ai.png` })
      await undo('Apple Intelligence read this recording')
      await h.waitForTimeout(1200)
      const back = await meetingOf(id)
      check('Undo puts the items found by rule back', !back.take && back.actions.length === was.actions.length, JSON.stringify(back.actions.map((one) => one.text)))
    } else check('Apple Intelligence read it within five minutes, or this Mac has none and the rule\'s items stay', !now.take && now.actions.length === was.actions.length)
  }
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the probe ran to its end', false, error.message)
} finally {
  await c.close()
  done()
}
