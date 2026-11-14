import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onlyInTitles, sortNamed, titlesWritten } from '../src/main/title-names.ts'
import { peopleIn } from '../src/main/roots.ts'

test('a name met only inside a work title is a character, not a person', () => {
  assert.equal(onlyInTitles('The Picture of Dorian Gray #book', 'Dorian Gray', ['The Picture of Dorian Gray']), true)
  assert.equal(onlyInTitles('Read The Picture of Dorian Gray. Dorian Gray is vain.', 'Dorian Gray', ['The Picture of Dorian Gray']), false)
  assert.equal(onlyInTitles('Lunch with Mary Shelley', 'Mary Shelley', ['The Picture of Dorian Gray']), false)
})

// As the Mac tags them on the user's own book (14 Nov): each of these was offered as a person.
const person = (text: string): { text: string; kind: string } => ({ text, kind: 'person' })
const everyday = (word: string): boolean => ['dan', 'what', 'you', 'read', 'skill', 'aesthetic', 'quick'].includes(word)

test('a site, a wiki, a company, a product or a method is never a person, whatever the Mac tags it', () => {
  for (const name of ['Elden Ring Lore Wiki', 'Asahi Linux', 'Morty API', 'Deezer API', 'Roth IRA', 'Arc Raiders Quick Menu', 'Dan Harmon Circle', 'Bell Labs', 'Dunning Kruger Effect'])
    assert.deepEqual(peopleIn([person(name)], everyday), [], name)
})

test('the Mac’s words that run past a name are not part of it', () => {
  assert.deepEqual(peopleIn([person('Epictetus - What You Read')], everyday, (name) => name === 'Epictetus'), ['Epictetus'])
  assert.deepEqual(peopleIn([person('Devon Crawford aesthetic')], everyday), ['Devon Crawford'])
  assert.deepEqual(peopleIn([person('TS skill')], everyday), [])
  assert.deepEqual(peopleIn([person('reed.dread Bayle')], everyday), [])
})

test('real people keep their whole names', () => {
  const real = ['Oscar Wilde', 'Guido van Rossum', 'Leonardo da Vinci', 'Richard E. Young', 'Kenneth L. Pike', 'Jean-Paul Sartre', 'Ólafur Arnalds', 'Dr. Rakesh Newaj', 'Alexander Graham Bell', 'Henry VIII', 'J.R.R. Tolkien', 'Taylor Swift']
  assert.deepEqual(peopleIn(real.map(person), everyday), real)
})

test('a name inside a title written with its author is a character of that work; the author and the rest stay people', () => {
  const text = 'Fiction & Literature\n1984 \u2014 George Orwell\nThe Picture of Dorian Gray \u2014 Oscar Wilde\nBrave New World \u2014 Aldous Huxley (control by force vs control by pleasure)\nWorks of Friedrich Nietzsche\n"Analysing Taylor Swift\'s Eras: Sentiment Through Time"'
  const found = ['George Orwell', 'Dorian Gray', 'Oscar Wilde', 'Aldous Huxley', 'Friedrich Nietzsche', 'Taylor Swift']
  assert.deepEqual(titlesWritten(text, found), ['The Picture of Dorian Gray'])
  const sorted = sortNamed(text, found, { cast: new Map(), people: new Set(['oscar wilde']), titles: [], about: null })
  assert.deepEqual(sorted.people.map((one) => one.name), ['George Orwell', 'Oscar Wilde', 'Aldous Huxley', 'Friedrich Nietzsche', 'Taylor Swift'])
  assert.deepEqual(sorted.characters, [{ name: 'Dorian Gray', work: 'The Picture of Dorian Gray', known: false }])
  assert.deepEqual(titlesWritten('I am reading The Picture of Dorian Gray by Oscar Wilde.', ['Dorian Gray', 'Oscar Wilde']), ['The Picture of Dorian Gray'])
  assert.deepEqual(titlesWritten('Oscar Wilde \u2014 The Picture of Dorian Gray', ['Oscar Wilde', 'Dorian Gray']), ['The Picture of Dorian Gray'])
  // No author beside it: a talk with someone is not a work, nor anyone's works.
  assert.deepEqual(titlesWritten('Lunch with Mary Shelley\nWorks of Friedrich Nietzsche', ['Mary Shelley', 'Friedrich Nietzsche']), [])
  assert.deepEqual(titlesWritten('Lunch with Mary Shelley - Percy Shelley', ['Mary Shelley', 'Percy Shelley']), [])
})

test('one of your People named only inside a title is offered nothing; named outside it too, they stay a person', () => {
  const book = { cast: new Map(), people: new Set(['dorian gray']), titles: [], about: null }
  assert.deepEqual(sortNamed('The Picture of Dorian Gray \u2014 Oscar Wilde', ['Dorian Gray', 'Oscar Wilde'], book).people.map((one) => one.name), ['Oscar Wilde'])
  assert.deepEqual(sortNamed('The Picture of Dorian Gray \u2014 Oscar Wilde\nDorian Gray is vain.', ['Dorian Gray', 'Oscar Wilde'], book).people.map((one) => one.name), ['Dorian Gray', 'Oscar Wilde'])
})
