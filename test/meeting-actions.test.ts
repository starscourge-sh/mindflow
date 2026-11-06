// Run with: node --test test/meeting-actions.test.ts
// Every Mac's meeting action items (src/main/meeting-doc.ts) on 200 lines with known answers: meeting talk, lyrics
// and a lecture. Precision is how many of the lines it calls something to do really are; recall how many of the real
// ones it finds. The old rule (native/meeting.swift's, before 6 Nov) is measured on the same lines beside it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionIn, foundActions, foldMeeting, itemWords } from '../src/main/meeting-doc.ts'
import { ALL, LECTURE, LYRICS, MEETING_TALK } from './fixtures/meeting-lines.ts'

const OLD = /\b(i'll|i will|we'll|we will|you'll|can you|could you|would you|please|let's|need to|needs to|have to|going to|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|the end of)|follow up|send|action)\b/i

function score(said: (text: string) => boolean): { precision: number; recall: number; flagged: number; right: number; wrong: string[] } {
  let flagged = 0, right = 0, real = 0
  const wrong: string[] = []
  for (const [text, is] of ALL) {
    const yes = said(text)
    if (is) real += 1
    if (yes) flagged += 1
    if (yes && is) right += 1
    if (yes !== is) wrong.push(`${is ? 'missed' : 'flagged'}: ${text}`)
  }
  return { precision: flagged ? right / flagged : 1, recall: real ? right / real : 1, flagged, right, wrong }
}

test('the set is 200 lines: meeting talk, lyrics and a lecture', () => {
  assert.equal(ALL.length, 200, `${MEETING_TALK.length} + ${LYRICS.length} + ${LECTURE.length}`)
})

test('precision on the 200 lines, before and after', () => {
  const before = score((text) => OLD.test(text))
  const after = score((text) => !!actionIn(text))
  console.log(`before: ${before.right} of ${before.flagged} flagged were real (precision ${(before.precision * 100).toFixed(1)}%, recall ${(before.recall * 100).toFixed(1)}%)`)
  console.log(`after: ${after.right} of ${after.flagged} flagged were real (precision ${(after.precision * 100).toFixed(1)}%, recall ${(after.recall * 100).toFixed(1)}%)`)
  if (after.wrong.length) console.log(after.wrong.join('\n'))
  assert.ok(after.precision >= 0.97, `precision ${after.precision}`)
  assert.ok(after.recall >= 0.85, `recall ${after.recall}`)
  assert.ok(!LYRICS.some(([text]) => actionIn(text)), 'no lyric is something to do')
})

test('the screenshot\'s song lines are not something to do', () => {
  for (const text of ["Lay me out over my way of branches You'll handle my heart while I take you in.", "That's when you'll see, we can find love in the air, we breathe, touch my body, feel the energy.", "eyes, that's when you'll see, we can find that, everything, touch the body, feel the energy, the day on time, the sun making."])
    assert.equal(actionIn(text), null, text)
})

test('an item is written as a person writes it down, with its owner', () => {
  assert.equal(itemWords('Yes, I will send them by Friday.'), 'send them by Friday')
  assert.equal(itemWords('Great. Can you also share the research notes?'), 'share the research notes')
  const items = foundActions([
    { id: 'o0', who: 's1', at: 3, end: 5, text: 'The designs are nearly done, I will send them by Friday.' },
    { id: 'y0', who: 'you', at: 6, end: 8, text: 'Great. Can you also share the research notes?' },
    { id: 'o1', who: 's1', at: 8.3, end: 10, text: 'Yes, I will add them to the folder today.' },
    { id: 'o2', who: 's2', at: 11, end: 13, text: 'Thandi, can you update the roadmap by Monday?' }
  ], { o0: '2026-11-13' })
  assert.deepEqual(items.map((one) => [one.owner, one.text, one.date]), [
    ['s1', 'send them by Friday', '2026-11-13'], ['s1', 'share the research notes', null], ['s1', 'add them to the folder today', null], ['Thandi', 'update the roadmap by Monday', null]])
})

test('a meeting kept the old way folds into its own kind, every word kept', () => {
  const old = { type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Stand-up' }] },
    { type: 'meeting', attrs: { audio: 'x', names: { s1: 'Thandi' } } },
    { type: 'meetingLine', attrs: { who: 's1', at: 1.2, end: 3, marked: true }, content: [{ type: 'text', text: 'Hello' }] },
    { type: 'meetingLine', attrs: { who: 'you', at: 4, end: 5 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'my note' }] }
  ] }
  const folded = foldMeeting(old) as typeof old & { content: { type: string; attrs?: { lines?: unknown[] } }[] }
  assert.deepEqual(folded.content.map((one) => one.type), ['heading', 'meeting', 'paragraph'])
  assert.deepEqual(folded.content[1].attrs!.lines, [{ id: 'l0', who: 's1', at: 1.2, end: 3, text: 'Hello', marked: true }, { id: 'l1', who: 'you', at: 4, end: 5, text: '' }])
  assert.equal(foldMeeting(folded), folded, 'folding twice changes nothing')
})
