import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle } from '../src/renderer/src/lib/clean-title.ts'

test('download-site stamps come off a PDF title', () => {
  assert.equal(cleanTitle('Cosmos - PDFDrive.com'), 'Cosmos')
  assert.equal(cleanTitle('Cosmos ( PDFDrive )'), 'Cosmos')
  assert.equal(cleanTitle('Algebra (Serge Lang) (z-lib.org)'), 'Algebra (Serge Lang)')
  assert.equal(cleanTitle('AI Engineering (Chip Huyen) (z-library.sk, 1lib.sk, z-lib.sk)'), 'AI Engineering (Chip Huyen)')
  assert.equal(cleanTitle('Microsoft Word - essay.docx'), 'essay')
})
test('a title that is only a stamp or a number is no title', () => {
  assert.equal(cleanTitle('untitled'), '')
  assert.equal(cleanTitle('1683634991755'), '')
  assert.equal(cleanTitle('www.example.com'), '')
})
test('an ordinary title is left alone', () => {
  assert.equal(cleanTitle('The Picture of Dorian Gray'), 'The Picture of Dorian Gray')
  assert.equal(cleanTitle('Frankenstein: or, The Modern Prometheus'), 'Frankenstein: or, The Modern Prometheus')
})
test('a file name reads as a person would say it', () => {
  assert.equal(cleanTitle('18 - The Picture of Dorian Gray (Penguin Classics) (Oscar Wilde, Robert Mighall) (z-lib.org).pdf'), 'The Picture of Dorian Gray (Penguin Classics) (Oscar Wilde, Robert Mighall)')
  assert.equal(cleanTitle('1984 The Graphic Novel (Orwell, George) - 1949.pdf'), '1984 The Graphic Novel (Orwell, George) - 1949')
  assert.equal(cleanTitle('Data_Structures_in_Python.pdf'), 'Data Structures in Python')
  assert.equal(cleanTitle('1984'), '1984')
})
