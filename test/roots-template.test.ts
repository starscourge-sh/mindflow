// "You already wrote this" was said of two different notes made from one
// template (Obsidian "PER - On …" notes: the same headings and lines, a
// different subject). The words a template repeats across many notes must not
// make two notes the same; a real near-copy still is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RootIndex, alreadyWrote } from '../src/main/roots.ts'

const TEMPLATE = (topic: string, body: string): string => `PER - On ${topic}
Core concepts at a glance
Why it matters in practice
Where it shows up in data engineering and machine learning
Common pitfalls and misconceptions
Connected to: statistics, data engineering fundamentals, vocabulary reference
${body}
Questions to revisit later
Sources and further reading`

const TOPICS: [string, string][] = [
  ['variable types in data', 'Nominal ordinal interval ratio scales decide which summaries are meaningful; categorical encodings, one hot dummies, cardinality.'],
  ['model training validation and test splits', 'Holdout sets estimate generalisation; leakage between folds inflates accuracy; stratified shuffling keeps class balance.'],
  ['least squares and why squaring errors matters', 'Gauss minimised summed squared residuals; outliers dominate; normal equations solve regression coefficients.'],
  ['statistical distributions', 'Gaussian binomial poisson exponential shapes; skewness kurtosis tails; sampling from priors.'],
  ['the dot product', 'Projection of one vector onto another; cosine similarity; orthogonal vectors give zero.'],
  ['numerical analysis', 'Floating point rounding, truncation, conditioning and stability of iterative solvers.'],
  ['matrices as transformation machines', 'Rotation scaling shear; determinants measure area change; eigenvectors stay on their line.'],
  ['interpolation vs extrapolation', 'Within the observed range estimates are safer; outside, polynomial wiggles explode.']
]
const others = Array.from({ length: 40 }, (_, i) => ({ key: `capture-${i}`, title: `Everyday note ${i}`, text: `Bought bread and milk on day ${i}, walked the dog, called mum about the weekend plans number ${i}.` }))

test('notes from one template, about different things, are not "already written"', () => {
  const notes = [...TOPICS.map(([topic, body], i) => ({ key: `article:${i}`, title: `PER - On ${topic}`, text: TEMPLATE(topic, body) })), ...others]
  const index = new RootIndex(notes)
  for (const note of notes.slice(0, TOPICS.length)) {
    const same = alreadyWrote(index, note.text, undefined, note.key)
    assert.equal(same, null, `${note.title} was called a copy of ${same && notes.find((one) => one.key === same.key)?.title}`)
  }
})

test('a real near-copy of a template note is still "already written"', () => {
  const [topic, body] = TOPICS[2]
  const notes = [...TOPICS.map(([t, b], i) => ({ key: `article:${i}`, title: `PER - On ${t}`, text: TEMPLATE(t, b) })), ...others,
    { key: 'article:copy', title: 'Least squares again', text: TEMPLATE(topic, `${body} Squared residuals again, summed and minimised.`) }]
  const index = new RootIndex(notes)
  const same = alreadyWrote(index, notes.at(-1)!.text, undefined, 'article:copy')
  assert.equal(same?.key, 'article:2')
})

test('a note is never its own copy, whatever its key says it is', () => {
  const notes = [{ key: 'article:abc', title: 'PER - On least squares', text: TEMPLATE('least squares', TOPICS[2][1]) }, ...others]
  const index = new RootIndex(notes)
  assert.equal(alreadyWrote(index, notes[0].text, undefined, 'nugget:abc'), null)
  assert.equal(alreadyWrote(index, notes[0].text, undefined, 'abc'), null)
})
