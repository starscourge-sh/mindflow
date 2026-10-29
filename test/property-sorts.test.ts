// Run with: node --test test/property-sorts.test.ts
// Display's "By <property>" sorts: offered only where they can change the order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { propertySorts } from '../src/renderer/src/lib/property-sorts.ts'

const said = (list: Record<string, unknown>[]): string[] => propertySorts(list.map((one) => ({ fields: JSON.stringify(one) })), () => 0).choices.map((one) => one.label)

test('a property sort is offered only where two notes hold it with different values', () => {
  assert.deepEqual(said([{ author: 'Ada' }, { author: 'Bo' }]), ['By Author'])
  assert.deepEqual(said([{ author: 'Ada' }, {}]), [])
  assert.deepEqual(said([{ author: 'Ada' }, { author: 'Ada' }]), [])
})

test('the board switch is never a property to sort by', () => {
  assert.deepEqual(said([{ 'kanban-plugin': 'board' }, { 'kanban-plugin': 'basic' }]), [])
})
