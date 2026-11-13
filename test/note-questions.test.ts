import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerInNote, draftFromWords, draftQuestions, givesAway, noteText } from '../src/main/note-questions.ts'

// A note as the editor keeps it (TipTap's JSON).
const text = (words: string, bold = false) => ({ type: 'text', text: words, ...(bold ? { marks: [{ type: 'bold' }] } : {}) })
const para = (...content: object[]) => ({ type: 'paragraph', content })
const heading = (words: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(words)] })
const list = (...items: string[]) => ({ type: 'bulletList', content: items.map((one) => ({ type: 'listItem', content: [para(text(one))] })) })
const doc = (...content: object[]) => ({ type: 'doc', content })

test('a definition sentence asks what the thing is, its answer the note’s own words', () => {
  const [one] = draftQuestions(doc(para(text('Photosynthesis is the way plants turn light into sugar.'))))
  assert.equal(one.rule, 'definition')
  assert.equal(one.question, 'What is Photosynthesis?')
  assert.equal(one.answer, 'the way plants turn light into sugar')
})

test('a bold term leading its line, with a colon or a dash, is a term to learn; a bold label is not', () => {
  const [term] = draftQuestions(doc(para(text('SageMaker Domain', true), text(' \u2014 the tenant boundary you set up before anyone can use Studio.'))))
  assert.equal(term.question, 'What is SageMaker Domain?')
  assert.equal(term.answer, 'the tenant boundary you set up before anyone can use Studio')
  assert.deepEqual(draftQuestions(doc(para(text('For exam prep:', true), text(' the old names are on the test, so learn both.')))), [])
})

test('a bold word inside a sentence becomes a gap to fill', () => {
  const [one] = draftQuestions(doc(para(text('The cell gets its energy from the '), text('mitochondria', true), text(' in every one of its parts.'))))
  assert.equal(one.rule, 'gap')
  assert.equal(one.question, 'Fill the gap: The cell gets its energy from the _____ in every one of its parts.')
  assert.equal(one.answer, 'mitochondria')
})

test('a lead-in line before a list asks for the list, counted', () => {
  const [one] = draftQuestions(doc(para(text('Kant asked three questions:')), list('What can I know?', 'What ought I to do?', 'What may I hope?')))
  assert.equal(one.rule, 'list')
  assert.equal(one.question, 'Kant asked three questions… (3)')
  assert.equal(one.answer, 'What can I know?; What ought I to do?; What may I hope?')
})

test('a heading with words under it asks about the heading; a heading that is a question is asked as it is', () => {
  const [about] = draftQuestions(doc(para(text('Memory, week 3')), heading('Spaced repetition'), para(text('Reviewing just before you forget makes each memory last longer than the time before.'))))
  assert.equal(about.question, 'What does your note say about “Spaced repetition”?')
  assert.equal(about.answer, 'Reviewing just before you forget makes each memory last longer than the time before.')
  const [asked] = draftQuestions(doc(para(text('Sky notes')), heading('Why do stars twinkle?'), para(text('The air moving over us bends their light a little, many times a second.'))))
  assert.equal(asked.question, 'Why do stars twinkle?')
})

test('the heading that opens a note is its name, not a topic; words under a heading that are a link or a path are not an answer', () => {
  assert.deepEqual(draftQuestions(doc(heading('Spaced repetition'), para(text('Reviewing just before you forget makes each memory last longer than the time before.')))), [])
  assert.deepEqual(draftQuestions(doc(para(text('Index')), heading('APIs and resources'), para(text('→ ../permanent/PER - Go Libraries & Public APIs Reference here')))), [])
})

test('no question from a subject that is not a name, a predicate that is not what it is, or a bold lead-in', () => {
  for (const line of ['15 of them are bigger features from the list that nobody has started.', 'Nearly every post is a short screen video of the app doing one thing.', 'Both are unreachable from the spec side of things.', 'The risk until then is small: it needs an admin login first.', 'The world is on fire, no one can save me but you.', 'why is it that the Note kind cannot get a source line?'])
    assert.deepEqual(draftQuestions(doc(para(text(line)))), [], line)
  assert.deepEqual(draftQuestions(doc(para(text('Hassle.', true), text(' Native permissions, notarization, compliance, regulatory exposure, real support burden.')))), [])
  assert.equal(draftQuestions(doc(para(text('Code you cannot modify is a liability that has been counted as an asset.'))))[0]?.question, 'What is code you cannot modify?')
  assert.equal(draftQuestions(doc(para(text('Target', true), text(': 21 minute videos (e.g. a guide to Docker in one sitting) for the channel.'))))[0]?.answer, '21 minute videos (e.g. a guide to Docker in one sitting) for the channel')
})

test('no question from a note with nothing to ask about, from a card line, a generic heading or a pronoun', () => {
  assert.deepEqual(draftQuestions(doc(para(text('Lovely walk today, the light was soft.')))), [])
  assert.deepEqual(draftQuestions(doc(para(text('What is entropy? :: a measure of disorder')))), [])
  assert.deepEqual(draftQuestions(doc(heading('Notes'), para(text('A few things I want to come back to some other day, maybe.'))))), [])
  assert.deepEqual(draftQuestions(doc(para(text('This is the best book I have read all year.')))), [])
  assert.deepEqual(draftQuestions(null), [])
})

test('three to five, one a line, the rules taking turns, in the note’s own order', () => {
  const many = doc(
    ...['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'].map((name) => para(text(`${name} is a letter that the Greeks wrote.`))),
    para(text('Water boils at '), text('100 degrees', true), text(' at the level of the sea.')),
  )
  const drafts = draftQuestions(many)
  assert.equal(drafts.length, 5)
  assert.ok(drafts.some((one) => one.rule === 'gap'), 'the gap rule gets its turn')
  assert.equal(new Set(drafts.map((one) => one.from)).size, 5)
})

test('every answer is in its note, and no question gives its answer away', () => {
  const note = doc(para(text('Physics, week 2')), heading('Entropy'), para(text('Entropy is a measure of how spread out energy is in a system.')), para(text('It always grows in a closed system, said the '), text('second law', true), text(' of thermodynamics.')))
  const words = noteText(note)
  for (const one of draftQuestions(note)) {
    assert.ok(answerInNote(one.answer, words), one.answer)
    assert.ok(!givesAway(one.question, one.answer), one.question)
  }
  assert.ok(!answerInNote('a measure of chaos', words))
})

test('a long note is read only as far as it needs: a million letters drafted at once (17 ms for the largest real note, 109,129 words; 3 s allowed on a busy Mac)', () => {
  const big = doc(...Array.from({ length: 20_000 }, (_, n) => para(text(`Line ${n} of a very long note with nothing much in it, said plainly and at length.`))))
  const at = performance.now()
  draftQuestions(big)
  assert.ok(performance.now() - at < 3000)
})

test('words picked in a note: a definition, a gap in their sentence, or a line to finish', () => {
  assert.equal(draftFromWords('A sonnet is a poem of fourteen lines.')?.question, 'What is a sonnet?')
  const gap = draftFromWords('fourteen', 'A sonnet has fourteen lines and a turn near the end.')
  assert.equal(gap?.question, 'Fill the gap: A sonnet has _____ lines and a turn near the end.')
  assert.equal(gap?.answer, 'fourteen')
  const line = draftFromWords('The unexamined life is not worth living for a man.')
  assert.equal(line?.rule, 'line')
  assert.ok(line && line.question.startsWith('Finish the line: “The unexamined'))
  assert.equal(draftFromWords(''), null)
})
