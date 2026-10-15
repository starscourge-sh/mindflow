// Run with: node --test test/icon-markup.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as icons from 'lucide-react'
import { iconMarkup } from '../src/renderer/src/lib/icon-markup.ts'

test('a link icon is drawn exactly as React would draw it', () => {
  const all = Object.entries(icons).filter(([name, icon]) => /Icon$/.test(name) === false && /^[A-Z]/.test(name) && typeof icon === 'object' && icon && 'render' in icon)
  assert.ok(all.length > 1000, `found ${all.length} icons`)
  for (const [name, icon] of all) {
    const want = renderToStaticMarkup(createElement(icon as never, { 'aria-hidden': true }))
    assert.equal(iconMarkup(icon as never), want, name)
  }
})

test('something that is not an icon draws nothing', () => {
  assert.equal(iconMarkup((() => null) as never), null)
})
