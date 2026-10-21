// Run with: node --test test/link-rename.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renameLinks } from '../src/main/link-rename.ts'

const link = (attrs: Record<string, unknown>) => ({ type: 'noteLink', attrs: { key: '', heading: '', text: '', kind: '', ...attrs } })
const line = (...content: unknown[]) => ({ type: 'paragraph', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content })
const target = { ids: ['n1'], from: 'Old name', to: 'New name' }

test('ten links to one note, each renamed, and the count says so', () => {
  const body = doc(...Array.from({ length: 10 }, () => line({ type: 'text', text: 'see ' }, link({ id: 'n1', label: 'Old name' }))))
  const { body: out, count } = renameLinks(body, target)
  assert.equal(count, 10)
  const labels = (out as ReturnType<typeof doc>).content.map((one) => (one as { content: { attrs?: { label: string } }[] }).content[1].attrs!.label)
  assert.deepEqual(labels, Array(10).fill('New name'))
})

test('the body given is not changed, and a body with no link to it comes back as it was', () => {
  const body = doc(line(link({ id: 'n1', label: 'Old name' })))
  const before = JSON.stringify(body)
  renameLinks(body, target)
  assert.equal(JSON.stringify(body), before)
  const other = doc(line(link({ id: 'n2', label: 'Old name' })))
  const { body: same, count } = renameLinks(other, target)
  assert.equal(count, 0)
  assert.equal(same, other)
})

test('a link to another note by the same name is left alone', () => {
  const body = doc(line(link({ id: 'n2', label: 'Old name' })), line(link({ id: 'n1', label: 'Old name' })))
  const { body: out, count } = renameLinks(body, target)
  assert.equal(count, 1)
  assert.equal((out as any).content[0].content[0].attrs.label, 'Old name')
  assert.equal((out as any).content[1].content[0].attrs.label, 'New name')
})

test('a link with words of its own keeps them; a heading or line it lands on is kept', () => {
  const body = doc(line(link({ id: 'n1', label: 'Old name', text: 'this', heading: 'Part two', block: 'b1x2' })))
  const attrs = (renameLinks(body, target).body as any).content[0].content[0].attrs
  assert.deepEqual([attrs.label, attrs.text, attrs.heading, attrs.block], ['New name', 'this', 'Part two', 'b1x2'])
})

test('a [[link]] typed by name and never followed finds the note, by name, ignoring case', () => {
  const body = doc(line(link({ id: '', label: 'old NAME' })), line(link({ id: '', label: 'Something else' })))
  const { body: out, count } = renameLinks(body, target)
  assert.equal(count, 1)
  assert.deepEqual((out as any).content[0].content[0].attrs.id, 'n1')
  assert.deepEqual((out as any).content[0].content[0].attrs.label, 'New name')
  assert.deepEqual((out as any).content[1].content[0].attrs.label, 'Something else')
})

test('a note shown in another (an embed) is renamed too, nested deep in a list', () => {
  const body = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [line(link({ id: 'n1', label: 'Old name' }))] }] }, { type: 'noteEmbed', attrs: { id: 'n1', label: 'Old name' } })
  const { body: out, count } = renameLinks(body, target)
  assert.equal(count, 2)
  assert.equal((out as any).content[1].attrs.label, 'New name')
  assert.equal((out as any).content[0].content[0].content[0].content[0].attrs.label, 'New name')
})

test('a gem or article is named by its tier and id', () => {
  const body = doc(line(link({ id: 'nugget:g1', label: 'Old name' })))
  assert.equal(renameLinks(body, { ...target, ids: ['nugget:g1'] }).count, 1)
  assert.equal(renameLinks(body, { ...target, ids: ['g1'] }).count, 0)
})

test('Markdown, as an import left it: links by id and by name both renamed', () => {
  const text = 'See [[@n1|Old name]], [[@n1#Intro|Old name]], [[old name]], [[Old name#Part|words]] and ![[Old name]]. Not [[@n2|Old name]] or [[Old names]].'
  const { body, count } = renameLinks(text, target)
  assert.equal(count, 5)
  assert.equal(body, 'See [[@n1|New name]], [[@n1#Intro|New name]], [[New name]], [[New name#Part|words]] and ![[New name]]. Not [[@n2|Old name]] or [[Old names]].')
})

test('nothing to do: no new name, no old one, or the same name', () => {
  const body = doc(line(link({ id: 'n1', label: 'Old name' })))
  assert.equal(renameLinks(body, { ...target, to: '  ' }).count, 0)
  assert.equal(renameLinks(body, { ...target, from: '' }).count, 0)
  assert.equal(renameLinks(body, { ...target, to: 'Old name' }).count, 0)
  assert.equal(renameLinks(null, target).count, 0)
})

test('a name with the marks a pattern uses is matched as written', () => {
  const text = '[[C++ (notes)?]] and [[C]]'
  const { body, count } = renameLinks(text, { ids: ['n1'], from: 'C++ (notes)?', to: 'C plus plus' })
  assert.equal(count, 1)
  assert.equal(body, '[[C plus plus]] and [[C]]')
})
