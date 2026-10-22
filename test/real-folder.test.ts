// Run with: node --test test/real-folder.test.ts
// A test run never opens your real data folder, under the new name or the first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRealFolder, refuseRun } from '../src/main/real-folder.ts'

const APP = '/Users/you/Library/Application Support'

test('both names of the real folder, and anything inside them, are real', () => {
  assert.equal(isRealFolder(`${APP}/haligtree`, APP), true)
  assert.equal(isRealFolder(`${APP}/mindflow/books/b-123456`, APP), true)
  assert.equal(isRealFolder(`${APP}/Haligtree/`, APP), true)
  assert.equal(isRealFolder(`${APP}/haligtree-copy`, APP), false)
  assert.equal(isRealFolder('/private/tmp/qa-123', APP), false)
})

test('a test run needs a folder of its own, and no run is pointed at a real one', () => {
  assert.equal(refuseRun({}, APP), null)
  assert.equal(refuseRun({ HALIGTREE_QA_AWAY: '1', HALIGTREE_USER_DATA: '/tmp/qa' }, APP), null)
  assert.match(refuseRun({ HALIGTREE_QA_AWAY: '1' }, APP) ?? '', /no data folder/)
  assert.match(refuseRun({ HALIGTREE_QA_AWAY: '0' }, APP) ?? '', /no data folder/)
  assert.match(refuseRun({ HALIGTREE_USER_DATA: `${APP}/mindflow` }, APP) ?? '', /real data folder/)
})
