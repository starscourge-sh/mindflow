// Run with: node --test test/pdf-labels.test.ts
// A label names a page only when it reads as a page number; Fluent Python's "Cover" and "O'Reilly" said
// "p. 96 of O'Reilly" (10 Nov).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printed } from '../src/renderer/src/components/pdf/pdf-labels.ts'

test('page-like labels are kept', () => {
  for (const one of ['48', 'xii', 'IV', 'A-3', 'CA', 'cb', '1-12']) assert.equal(printed(one), one)
})
test('section names are not page numbers', () => {
  for (const one of ['Cover', "O'Reilly", 'Contents', 'Index', '', undefined]) assert.equal(printed(one), undefined)
})
