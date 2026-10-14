// Run with: node --test test/mac-dictionary.test.ts
// Lines as the Mac's Dictionary gives them, read into what the box shows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readMac } from '../src/main/mac-dictionary.ts'

test('a plain entry: sound, part of speech, first sense and its example', () => {
  const read = readMac('serendipity | ˌsɛr(ə)nˈdɪpɪti | noun [mass noun] the occurrence and development of events by chance in a happy or beneficial way: a fortunate stroke of serendipity | [count noun] : a series of small serendipities. ORIGIN 1754: coined by Horace Walpole.')
  assert.deepEqual(read, { word: 'serendipity', phonetic: 'ˌsɛr(ə)nˈdɪpɪti', part: 'noun', definition: 'The occurrence and development of events by chance in a happy or beneficial way.', example: 'a fortunate stroke of serendipity', also: '' })
})

test('two pronunciations keep the first; a sub-sense is left out', () => {
  const read = readMac('ephemera | ɪˈfɛm(ə)rə, ɛˈfɛm(ə)rə | plural noun things that exist or are used or enjoyed for only a short time: there were papers, letters, old boxes, all sorts of ephemera. • collectable items that were originally expected to have only short-term usefulness or popularity: Mickey Mouse ephemera. ORIGIN late 16th century')
  assert.equal(read?.phonetic, 'ɪˈfɛm(ə)rə')
  assert.equal(read?.part, 'plural noun')
  assert.equal(read?.definition, 'Things that exist or are used or enjoyed for only a short time.')
  assert.equal(read?.example, 'there were papers, letters, old boxes, all sorts of ephemera')
})

test('numbered senses: the first, and the second as "also"', () => {
  const read = readMac('running | ˈrʌnɪŋ | noun [mass noun] 1 the action or movement of a runner: his running tore United to shreds. • the sport of racing on foot: marathon running. 2 the action of managing or operating something: the day-to-day running of the office. adjective [attributive] 1 (of water) flowing naturally')
  assert.equal(read?.definition, 'The action or movement of a runner.')
  assert.equal(read?.example, 'his running tore United to shreds')
  assert.equal(read?.also, 'The action of managing or operating something.')
})

test('a plural finds its word; a long sense is cut at its first sentence', () => {
  const read = readMac('cat 1 | kat | noun 1 a small domesticated carnivorous mammal with soft fur, a short snout, and retractable claws. It is widely kept as a pet or for catching mice. • a wild animal of the cat family.')
  assert.equal(read?.word, 'cat')
  assert.equal(read?.definition, 'A small domesticated carnivorous mammal with soft fur, a short snout, and retractable claws.')
  assert.equal(read?.example, '')
})

test('a place and a person', () => {
  const london = readMac("London | ˈlʌndən | 1 the capital of the United Kingdom, situated in south-eastern England on the River Thames; population (Greater London) 7,619,800 (est. 2008). London was settled as a river port. 2 an industrial city in south-western Ontario")
  assert.equal(london?.part, '')
  assert.equal(london?.definition, 'The capital of the United Kingdom, situated in south-eastern England on the River Thames.')
  const bard = readMac("Shakespeare, William | ˈʃeɪkspɪə | (1564–1616), English playwright. Shakespeare's plays are written mostly in blank verse.")
  assert.equal(bard?.word, 'Shakespeare')
  assert.equal(bard?.definition, '(1564–1616), English playwright.')
})

test('a second part of speech ends the first sense', () => {
  const read = readMac('halcyon | ˈhalsiən | adjective denoting a period of time in the past that was idyllically happy and peaceful: the halcyon days of the mid 1980s, when profits were soaring. noun 1 a mythical bird said by ancient writers to breed in a nest floating at sea')
  assert.equal(read?.part, 'adjective')
  assert.equal(read?.example, 'the halcyon days of the mid 1980s, when profits were soaring')
})

test('another spelling in brackets is passed over', () => {
  const read = readMac("uber- | ˈuːbə | (über- | ˈyːbə |) combining form denoting an outstanding or supreme example of a particular kind of person or thing: an audience composed largely of ubergeeks | he was an uber-fan. • to a great or extreme degree")
  assert.equal(read?.part, 'combining form')
  assert.equal(read?.definition, 'Denoting an outstanding or supreme example of a particular kind of person or thing.')
  assert.equal(read?.example, 'an audience composed largely of ubergeeks')
})

test('nothing found reads as nothing', () => {
  assert.equal(readMac(''), null)
})
