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

/** The selector with what sits in brackets and escapes blanked, the same length, so only top-level combinators show. */
const blank = (selector: string): string => {
  let depth = 0
  let flat = ''
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '\\') { flat += '__'; i++; continue }
    if (ch === ')' || ch === ']') depth--
    flat += depth ? '_' : ch
    if (ch === '(' || ch === '[') depth++
  }
  return flat
}

/** Where the last part of a blanked selector starts (after its last combinator). */
const lastPart = (flat: string): number => Math.max(...['>', '+', '~', ' '].map((one) => flat.trimEnd().lastIndexOf(one))) + 1

const COMMON = new Set(['div', 'span', 'img', 'svg', 'path', 'a', 'p', 'button', 'li', 'ul', 'ol', 'input', 'label', 'g'])

/** Whether a selector has a :has() with a combinator after it and a last part that names nothing narrow. */
export const broad = (selector: string): boolean => {
  const at = selector.indexOf(':has(')
  if (at < 0) return false
  const flat = blank(selector)
  // What follows the part holding the first :has(): its own part's end, then the rest.
  const end = flat.slice(at).search(/\s*[\s>+~]\s*/)
  if (end < 0) return false
  const rest = flat.slice(at + end).trim()
  if (!rest) return false
  // Sibling-only ("A:has(B) + C") reaches one element, not a subtree.
  if (!/^[>]|\s|>/.test(flat.slice(at + end).replace(/\s*([>+~])\s*/g, '$1'))) return false
  // The last part as written (the blanked copy is as long as the selector), its :not(...) groups and pseudo-elements set aside:
  // ":is(.a, .b)" names classes, ":not(.a)" does not.
  const last = selector.slice(lastPart(flat)).replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?!\()/g, '')
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

/**
 * Whether a sibling rule (+ or ~) ends in a part that names no tag, class, id or attribute, or asks the class
 * attribute itself. Chromium cannot aim a sibling rule at one element when something is put in or taken out beside
 * it, so it asks it of everything under the parent: "* + *" restyled all of it, "[class~='x']" every element with a
 * class. ⌘K, a menu or a hover card over the largest note restyled the whole window that way (15 Nov, 15,000
 * elements, 140 to 360 ms). Escaped characters and anything in brackets are set aside first.
 */
export const siblingBroad = (selector: string): boolean => {
  const flat = blank(selector)
  if (!/[+~]/.test(flat)) return false
  if (/\[\s*class\s*([~*^$|]?=|\])/.test(selector)) return true
  const last = selector.slice(lastPart(flat)).replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(?!\()/g, '')
  // A tag, a class, an id, an attribute, or SCSS's "&" (the selector it sits in).
  return !/[.#[&]|(^|[(,\s])[a-z]/i.test(last)
}

test('the sibling rule is right on known cases', () => {
  assert.equal(siblingBroad('.mf-segs > * + *::before'), true)
  assert.equal(siblingBroad(".mf-segs > :is(:hover, [data-state='open']) + *::before"), true)
  assert.equal(siblingBroad(":root[data-style='brutal'] :is([class~='border-b']) + :is([class~='border-t'])"), true)
  assert.equal(siblingBroad(".mf-segs > :is(:hover, [data-state='open']) + :where(.mf-seg)::before"), false)
  assert.equal(siblingBroad('.mf-segs > :where(:not(:first-child))::before'), false)
  assert.equal(siblingBroad('.sticky-text[data-hide-first] .ProseMirror > :first-child + :is(h1, h2)'), false)
  assert.equal(siblingBroad('.tile-pic + .\\[\\.tile-pic\\+\\&\\]\\:block'), false)
  assert.equal(siblingBroad(':nth-child(2n+1) p'), false)
})

/** Whether a compound names a class, an id or an attribute, itself or in an :is()/:where() whose every choice does (Chromium's own test). */
const named = (compound: string): boolean => {
  if (/[.#[]/.test(blank(compound))) return true
  return [...compound.matchAll(/:(?:is|where)\(/g)].some((found) => {
    let depth = 1
    let inner = ''
    for (let i = found.index + found[0].length; i < compound.length && depth; i++) {
      if (compound[i] === '(') depth++
      if (compound[i] === ')') depth--
      if (depth) inner += compound[i]
    }
    return list(inner).every((choice) => named(choice.slice(lastPart(blank(choice)))))
  })
}

/**
 * Whether a sibling rule (+ or ~) has a left part that names no class, id or attribute ("p + p", ":first-child + h2",
 * "li ~ li"). Chromium keeps every such rule in one list it asks of all the elements beside anything put in or taken
 * out, and restyles each that its right part names: ⌘K, a menu or a hover card over the largest note restyled its 3,472
 * paragraphs and 935 headings that way (15 Nov, about 5,000 elements, 90 ms), and every new line typed did the same.
 */
export const siblingUnnamed = (selector: string): boolean => {
  const flat = blank(selector)
  return [...flat].some((ch, at) => {
    if (ch !== '+' && ch !== '~') return false
    const before = flat.slice(0, at).trimEnd()
    return !named(selector.slice(lastPart(before), before.length))
  })
}

test('the left part of a sibling rule is right on known cases', () => {
  assert.equal(siblingUnnamed('.x > p + p'), true)
  assert.equal(siblingUnnamed('.x > :is(h1, h2) + p'), true)
  assert.equal(siblingUnnamed('.x li + li'), true)
  assert.equal(siblingUnnamed('.x > :first-child + :is(h1, h2)'), true)
  assert.equal(siblingUnnamed('.menu input:focus + .list [data-first]'), true)
  assert.equal(siblingUnnamed(".segs > :is(:hover, [data-state='open']) + :where(.seg)::before"), true)
  assert.equal(siblingUnnamed('.x > :not(.a) + p'), true)
  assert.equal(siblingUnnamed('.x > .mf-p + p'), false)
  assert.equal(siblingUnnamed(".segs > .seg:is(:hover, [data-state='open']) + :where(.seg)::before"), false)
  assert.equal(siblingUnnamed(".menu input[type='text']:focus + .list [data-first]"), false)
  assert.equal(siblingUnnamed('.x > :is(.a, [b]) + p'), false)
  assert.equal(siblingUnnamed('.x > :nth-child(2n+1) p'), false)
  assert.equal(siblingUnnamed('.tile-pic + .\\[\\.tile-pic\\+\\&\\]\\:block'), false)
})

/** Every selector of a stylesheet written out whole: SCSS's nesting ("&", a part opening with "+") resolved. */
const selectors = (text: string): string[] => {
  const out: string[] = []
  const parents: string[][] = [['']]
  let prelude = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    // SCSS's #{...} is part of a selector, not a block.
    if (ch === '#' && text[i + 1] === '{') {
      const end = text.indexOf('}', i)
      prelude += text.slice(i, end + 1)
      i = end
    } else if (ch === '{') {
      const at = prelude.trim()
      prelude = ''
      // An at-rule, or a nested property ("font: { ... }"), passes its parent's selectors on unchanged.
      if (/^@/.test(at) || /^[\w-]+\s*:\s*$/.test(at)) { parents.push(parents.at(-1)!); continue }
      const whole = list(at).flatMap((one) => parents.at(-1)!.map((parent) => (one.includes('&') ? one.replaceAll('&', parent) : `${parent} ${one}`).replace(/\s+/g, ' ').trim()))
      out.push(...whole)
      parents.push(whole)
    } else if (ch === '}') (parents.length > 1 && parents.pop(), (prelude = ''))
    else if (ch === ';') prelude = ''
    else prelude += ch
  }
  return out
}

test('no sibling rule leaves its left part unnamed, written out whole as SCSS nests it', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src', /\.s?css$/)) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const selector of selectors(text)) if (siblingUnnamed(selector)) found.push(`${file}: ${selector}`)
  }
  assert.deepEqual(found, [], `name the line before by a class, an id or an attribute, or ask its place (:not(:first-child), :nth-child(2)): ${found.join('\n')}`)
})

/** The welcome covers the app whole while it shows (main.css): nothing under it is drawn or restyled meanwhile. */
const SIBLING_KEPT = new Set([':root[data-welcoming] .mf-welcome ~ *'])

test('no :has() is followed by a part that names nothing narrow, nor a sibling rule', () => {
  const found: string[] = []
  for (const file of files('src/renderer/src', /\.s?css$/)) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const prelude of text.match(/[^{};]+(?=\{)/g) ?? []) {
      if (/^\s*@/.test(prelude)) continue
      for (const selector of list(prelude)) if (broad(selector) || (siblingBroad(selector) && !SIBLING_KEPT.has(selector))) found.push(`${file}: ${selector}`)
    }
  }
  assert.deepEqual(found, [], `give the last part a class or attribute, or move the :has() onto it; never "* + *" or [class~=]: ${found.join('\n')}`)
})
