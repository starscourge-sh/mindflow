// Run with: node --test test/no-one-sided-border.test.ts
// A coloured line down one side (or along the bottom) of a rounded pill bends
// up at the corners and reads as pasted on: the box's command words ("5m tea",
// "+name:", "#bug") once had one. A rounded thing gets a full soft tint, a fine
// ring all the way round, or a plain underline, never a border on one side.
// This reads every renderer stylesheet and fails on any rule that rounds its
// corners and draws a border (or an inset shadow line) on one side only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const renderer = join(root, 'src/renderer/src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(css|scss)$/.test(name) ? [path] : []
  })
}

/** Each block's own declarations (nested blocks left out), with its selector and line. */
function blocks(text: string): { selector: string; body: string; line: number }[] {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, (c, lead) => lead + ' '.repeat(c.length - lead.length))
  const out: { selector: string; body: string; line: number }[] = []
  const stack: { selector: string; body: string; line: number }[] = []
  let chunk = ''
  let line = 1
  for (const ch of clean) {
    if (ch === '\n') line++
    if (ch === '{') {
      stack.at(-1) && (stack.at(-1)!.body += chunk.slice(0, chunk.lastIndexOf(';') + 1))
      stack.push({ selector: chunk.slice(chunk.lastIndexOf(';') + 1).trim(), body: '', line })
      chunk = ''
    } else if (ch === '}') {
      const done = stack.pop()
      if (done) out.push({ ...done, body: done.body + chunk })
      chunk = ''
    } else chunk += ch
  }
  return out
}

const zero = (value: string): boolean => /^\s*(0|0px|0rem|0em|none)\s*$/.test(value) || /\btransparent\b/.test(value)
const decls = (body: string): [string, string][] =>
  body.split(';').map((one) => one.split(':')).filter((pair) => pair.length >= 2).map(([name, ...rest]) => [name.trim().toLowerCase(), rest.join(':').trim()])

const roundsIt = (body: string): boolean => decls(body).some(([name, value]) => /^border(-[a-z]+)*-radius$/.test(name) && !zero(value))
/** The classes of the element a selector styles: the last part of each of its selectors. */
const subjects = (selector: string): string[] =>
  selector.split(',').flatMap((one) => (one.trim().split(/[\s>+~]+/).at(-1) ?? '').match(/\.[\w-]+/g) ?? [])

function oneSided(body: string, rounded: boolean): string | null {
  const all = decls(body)
  if (!rounded) return null
  for (const [name, value] of all) {
    if (/^border-(left|right|top|bottom|inline-start|inline-end|block-start|block-end)(-width)?$/.test(name) && !zero(value)) return `${name}: ${value}`
    if (name === 'box-shadow') {
      for (const layer of value.split(/,(?![^(]*\))/)) {
        const parts = layer.trim().split(/\s+/)
        if (parts[0] !== 'inset') continue
        const [x, y, blur = '0', spread = '0'] = parts.slice(1).map((p) => (/^-?[\d.]+(px|rem|em)?$/.test(p) ? p : '0'))
        const off = (n: string): boolean => parseFloat(n) !== 0
        if (off(x) !== off(y) && !off(blur) && !off(spread)) return `box-shadow: ${layer.trim()}`
      }
    }
  }
  return null
}

test('no rounded element draws a border on one side only', () => {
  const found: string[] = []
  const sheets = files(renderer).map((file) => ({ file, blocks: blocks(readFileSync(file, 'utf8')) }))
  // A class rounded in one rule is rounded in the next that colours it (.box-token, then .box-token[data-token-color]).
  const round = new Set(sheets.flatMap((sheet) => sheet.blocks.filter((block) => roundsIt(block.body)).flatMap((block) => subjects(block.selector))))
  for (const { file, blocks: all } of sheets) {
    for (const block of all) {
      const bad = oneSided(block.body, roundsIt(block.body) || subjects(block.selector).some((name) => round.has(name)))
      if (bad) found.push(`${relative(root, file)}:${block.line} ${block.selector} { ${bad} }`)
    }
  }
  assert.deepEqual(found, [], `A rounded element with a border on one side only; use a full tint, a ring all the way round, or an underline:\n${found.join('\n')}`)
})

test('the box command words are a tint and a full ring', () => {
  const css = readFileSync(join(renderer, 'assets/main.css'), 'utf8')
  const token = blocks(css).filter((block) => /\.box-token\b/.test(block.selector))
  assert.ok(token.length > 0, 'the .box-token rules are where they were')
  for (const block of token) {
    for (const [name, value] of decls(block.body)) {
      assert.ok(!/^border-(left|right|top|bottom|inline|block)/.test(name), `${block.selector} has ${name}`)
      if (name === 'box-shadow') assert.match(value, /inset 0 0 0 1px/, `${block.selector} box-shadow is a full ring`)
    }
  }
})
