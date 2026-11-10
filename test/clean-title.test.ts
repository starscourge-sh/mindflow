import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle } from '../src/main/clean-title.ts'

test('download-site stamps come off a PDF title', () => {
  assert.equal(cleanTitle('Cosmos - PDFDrive.com'), 'Cosmos')
  assert.equal(cleanTitle('Cosmos ( PDFDrive )'), 'Cosmos')
  assert.equal(cleanTitle('Algebra (Serge Lang) (z-lib.org)'), 'Algebra (Serge Lang)')
  assert.equal(cleanTitle('AI Engineering (Chip Huyen) (z-library.sk, 1lib.sk, z-lib.sk)'), 'AI Engineering (Chip Huyen)')
  assert.equal(cleanTitle('Microsoft Word - essay.docx'), 'Essay')
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
test('a Project Gutenberg stamp and an all lower or upper case name read as a book title', () => {
  assert.equal(cleanTitle('The Project Gutenberg eBook #38769: A Course of Pure Mathematics'), 'A Course of Pure Mathematics')
  assert.equal(cleanTitle('The Project Gutenberg EBook of Frankenstein, by Mary Shelley'), 'Frankenstein, by Mary Shelley')
  assert.equal(cleanTitle('frankenstein'), 'Frankenstein')
  assert.equal(cleanTitle('A COURSE OF PURE MATHEMATICS.pdf'), 'A Course of Pure Mathematics')
  assert.equal(cleanTitle('the crime book'), 'The Crime Book')
  assert.equal(cleanTitle('NASA'), 'NASA')
})
