// Run with: node --test test/has-narrow.test.ts
// A :has() with more after it ("A:has(B) C") has Chromium, whenever anything that could match B comes or goes
// anywhere in the window, restyle every C under the root. When C names nothing narrow ("*", only a :not(...), a
// common tag such as img or span), that is most of the window: Files' table scrolled at 70ms a frame instead of 10ms
// because of one such rule (the writing room's foot, main.css). The last part after a :has() names a class, an id or
// an attribute of its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string, kind: RegExp): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path, kind) : kind.test(name) ? [path] : []
})

/** Splits at top-level commas. */
const list = (text: string): string[] => {
  const out: string[] = []
  let depth = 0
  let part = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && !depth) (out.push(part), (part = ''))
    else part += ch
  }
  return [...out, part].map((one) => one.trim()).filter(Boolean)
}

const COMMON = new Set(['div', 'span', 'img', 'svg', 'path', 'a', 'p', 'button', 'li', 'ul', 'ol', 'input', 'label', 'g'])

/** Whether a selector has a :has() with a combinator after it and a last part that names nothing narrow. */
export const broad = (selector: string): boolean => {
  const at = selector.indexOf(':has(')
  if (at < 0) return false
  // Every (...) group blanked, so only top-level combinators count; the same length as the selector.
  let depth = 0
  let flat = ''
  for (const ch of selector) {
    if (ch === ')') depth--
    flat += depth ? '_' : ch
    if (ch === '(') depth++
  }
  // What follows the part holding the first :has(): its own part's end, then the rest.
  const end = flat.slice(at).search(/\s*[\s>+~]\s*/)
  if (end < 0) return false
  const rest = flat.slice(at + end).trim()
  if (!rest) return false
  // Sibling-only ("A:has(B) + C") reaches one element, not a subtree.
  if (!/^[>]|\s|>/.test(flat.slice(at + end).replace(/\s*([>+~])\s*/g, '$1'))) return false
  // The last part as written (the blanked copy is as long as the selector), its :not(...) groups and pseudo-elements set aside:
  // ":is(.a, .b)" names classes, ":not(.a)" does not.
  const from = Math.max(...['>', '+', '~', ' '].map((one) => flat.trimEnd().lastIndexOf(one))) + 1
  const last = selector.slice(from).replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?!\()/g, '')
  if (/[.#[]/.test(last)) return false
  // A rare tag (summary, video) is narrow enough; a common one, or none, is most of the window.
  const tag = last.match(/^[a-z][a-z0-9-]*/i)?.[0].toLowerCase()
  return !tag || COMMON.has(tag)
}

test('the rule is right on known cases', () => {
  assert.equal(broad("[data-room] [data-room-foot][data-typing]:not(:has([data-state='open'])) > :not(.mf-blur-edge)"), true)
  assert.equal(broad('.tiptap-thread:has(> img) img'), true)
  assert.equal(broad("[data-room] [data-room-foot][data-typing]:not(:has([data-state='open'])) > .mf-blur-edge > span"), true)
  assert.equal(broad("[data-room] [data-room-foot][data-typing]:not(:has([data-state='open'])) > .mf-blur-edge::before"), false)
  assert.equal(broad('body:has(.mf-look) [data-radix-popper-content-wrapper]'), false)
  assert.equal(broad('.a:has(> .b)'), false)
  assert.equal(broad(".mf-segs > :is(:hover, :has([data-state='open'])) + *::before"), false)
  assert.equal(broad(':root[data-zen-hide] [data-zen-row]:not(:hover) > :not([data-zen-keep]):not(:has([data-state=open]))'), false)
})

test('no :has() is followed by a part that names nothing narrow', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src', /\.s?css$/)) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const prelude of text.match(/[^{};]+(?=\{)/g) ?? []) {
      if (/^\s*@/.test(prelude)) continue
      for (const selector of list(prelude)) if (broad(selector)) found.push(`${file}: ${selector}`)
    }
  }
  assert.deepEqual(found, [], `give the last part a class or attribute, or move the :has() onto it: ${found.join('\n')}`)
})
