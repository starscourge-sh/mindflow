// Run with: node --test test/deck-fields.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kindFieldsOf, kindTags, whoFieldOf } from '../src/main/deck-fields.ts'

test('the maker field is found in English and the names shared decks use', () => {
  assert.equal(whoFieldOf(['Artwork', 'Artist', 'Title']), 'Artist')
  assert.equal(whoFieldOf(['Front', 'Creator']), 'Creator')
  assert.equal(whoFieldOf(['Image', 'Painter', 'Year']), 'Painter')
  assert.equal(whoFieldOf(['Quote', 'Made by']), 'Made by')
})

test('the maker field is found in other languages, accents or not', () => {
  assert.equal(whoFieldOf(['Bild', 'Künstler', 'Titel']), 'Künstler')
  assert.equal(whoFieldOf(['Bild', 'Kunstler']), 'Kunstler')
  assert.equal(whoFieldOf(['Œuvre', 'Artiste', 'Titre']), 'Artiste')
  assert.equal(whoFieldOf(['Obra', 'Artista']), 'Artista')
  assert.equal(whoFieldOf(['Werk', 'Maler']), 'Maler')
  assert.equal(whoFieldOf(['Tableau', 'Peintre']), 'Peintre')
  assert.equal(whoFieldOf(['Livre', 'Auteur']), 'Auteur')
  assert.equal(whoFieldOf(['Buch', 'Autorin']), 'Autorin')
  assert.equal(whoFieldOf(['Stück', 'Komponist']), 'Komponist')
  assert.equal(whoFieldOf(['Film', 'Réalisateur']), 'Réalisateur')
})

test('no maker field is guessed where there is none', () => {
  assert.equal(whoFieldOf(['Front', 'Back']), null)
  assert.equal(whoFieldOf(['Word', 'Meaning', 'DE', 'EN']), null)
  // A field that only contains the word is not taken: "Artist notes" is notes.
  assert.equal(whoFieldOf(['Artist notes']), null)
})

test('kind fields are found in any of the common languages', () => {
  assert.deepEqual(kindFieldsOf(['Artist', 'Period/Movement', 'Date']), ['Period/Movement'])
  assert.deepEqual(kindFieldsOf(['Era', 'Genre']), ['Era', 'Genre'])
  assert.deepEqual(kindFieldsOf(['Epoche', 'Stil', 'Schule']), ['Epoche', 'Stil', 'Schule'])
  assert.deepEqual(kindFieldsOf(['Époque', 'École', 'Mouvement']), ['Époque', 'École', 'Mouvement'])
  assert.deepEqual(kindFieldsOf(['Movimiento', 'Escuela', 'Estilo']), ['Movimiento', 'Escuela', 'Estilo'])
  assert.deepEqual(kindFieldsOf(['Image Source', 'Front', 'Operation']), [])
})

test('kind values become tags; dates and lists stay words', () => {
  assert.deepEqual(kindTags(['Baroque', 'Abstract Expressionism', 'c. 1620', 'Cubism, Futurism', '']), ['baroque', 'abstract-expressionism'])
  assert.deepEqual(kindTags(['Époque classique']), ['époque-classique'])
})
