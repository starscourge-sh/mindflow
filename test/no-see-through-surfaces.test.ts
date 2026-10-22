// Run with: node --test test/no-see-through-surfaces.test.ts
// Anything that floats over the page (a pill, a toast, a bar that sticks, a
// button over a picture) has a solid background. With no backdrop blur in the
// main window (no-backdrop-blur.test.ts), a see-through one shows the rows
// under it sharp, words over words: the "Setting out the examples" pill on
// Paper was one. A tint is mixed into the page's own colour instead:
// `color-mix(in oklab, var(--accent) 40%, var(--background))`.
//
// Floating here means fixed, sticky, or absolute and not tucked behind (a
// hover highlight at -z-10) or filling its parent (inset-0, which is either a
// scrim or a picture's own layer). An absolute element with nothing inside it
// is a line, a dot, a glow or a tint laid on purpose, not a surface carrying
// words. The background is read from the element's className and from its
// style, with a style's spread constants followed; part opacity counts only on
// an element that has a background of its own. A background that follows
// --mf-window-tint is glass only where the window itself is glass.
// qa/see-through.mjs checks the same in the running app, page by page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const root = join(import.meta.dirname, '..')
const renderer = join(root, 'src/renderer/src')

// Windows with real vibrancy behind them, where glass is the look: the Look
// window over a sticky, the sticky notes (Glass mode) and a goal's beacon on
// the desktop. (The box's own glass pill in App.tsx is solid on solid themes.)
const ALLOWED = new Set([
  'src/renderer/src/components/haligtree/look-window.tsx',
  'src/renderer/src/components/haligtree/sticky-note.tsx',
  'src/renderer/src/components/haligtree/today-sticky.tsx',
  'src/renderer/src/components/haligtree/goal-beacon.tsx'
])

/** A class with no state in front of it, or only `dark:` (the root always carries .dark). */
const plain = (token: string): string | null => {
  const parts = token.split(':')
  const base = parts.pop()!
  return parts.every((part) => part === 'dark' || part === '!') ? base.replace(/^!|!$/g, '') : null
}
const SEE_THROUGH_CLASS = /^(bg-[a-z0-9-]+\/(\d+|\[[\d.]+%?\])|bg-\(--[a-z0-9-]+\)\/\d+|bg-\[[^\]]*(transparent|rgba\(|\/_?0?\.\d)[^\]]*\]|bg-transparent|opacity-([1-9]|[1-8]\d|9[05]))$/
const SEE_THROUGH_VALUE = /transparent\)|rgba\(|\/\s*0?\.\d|\/\s*\d{1,2}%/

function floating(tokens: string[], empty: boolean): boolean {
  const bases = tokens.map(plain).filter((one): one is string => !!one)
  if (bases.includes('fixed') && bases.includes('inset-0')) return false // a scrim behind a dialog
  if (bases.includes('fixed') || bases.includes('sticky')) return true
  if (!bases.includes('absolute')) return false
  if (empty || bases.some((one) => /^-z-/.test(one) || one === 'inset-0' || /^-?inset-\[?-?\d/.test(one))) return false
  return true
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx$/.test(name) ? [path] : []
  })
}

/** Every bit of literal text inside an attribute's value, conditional branches and all, a file's own string constants followed. */
function texts(node: ts.Node, strings: Map<string, ts.Node> = new Map()): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (one: ts.Node): void => {
    if (ts.isIdentifier(one) && strings.has(one.text) && !seen.has(one.text)) {
      seen.add(one.text)
      walk(strings.get(one.text)!)
    } else if (ts.isStringLiteral(one) || ts.isNoSubstitutionTemplateLiteral(one)) out.push(one.text)
    else if (ts.isTemplateExpression(one)) {
      out.push(one.head.text)
      for (const span of one.templateSpans) {
        walk(span.expression)
        out.push(span.literal.text)
      }
      return
    }
    ts.forEachChild(one, walk)
  }
  walk(node)
  return out
}

test('no floating surface in the main window, note windows or the box is see-through', () => {
  const found: string[] = []
  for (const file of files(renderer)) {
    const name = relative(root, file)
    if (ALLOWED.has(name)) continue
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    // Constants a style can spread: `const TAPE = { backgroundColor: ... }`.
    const objects = new Map<string, ts.ObjectLiteralExpression>()
    const strings = new Map<string, ts.Node>()
    const collect = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) objects.set(node.name.text, node.initializer)
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isTemplateExpression(node.initializer))) strings.set(node.name.text, node.initializer)
      ts.forEachChild(node, collect)
    }
    collect(source)
    /** The background a style object ends with, spreads followed, the last one winning. */
    const background = (expression: ts.Expression | undefined, depth = 0): string | null => {
      if (!expression || depth > 4) return null
      if (ts.isIdentifier(expression)) return background(objects.get(expression.text), depth + 1)
      if (ts.isParenthesizedExpression(expression)) return background(expression.expression, depth)
      if (!ts.isObjectLiteralExpression(expression)) return null
      let last: string | null = null
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) last = background(property.expression, depth + 1) ?? last
        else if (ts.isPropertyAssignment(property) && /^(background|backgroundColor)$/.test(property.name.getText(source).replace(/['"]/g, ''))) last = property.initializer.getText(source)
      }
      return last
    }
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const attribute = (key: string): ts.JsxAttribute | undefined =>
          node.attributes.properties.find((one): one is ts.JsxAttribute => ts.isJsxAttribute(one) && one.name.getText(source) === key)
        const className = attribute('className')
        const tokens = className?.initializer ? texts(className.initializer, strings).join(' ').split(/\s+/).filter(Boolean) : []
        if (floating(tokens, ts.isJsxSelfClosingElement(node))) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
          const style = attribute('style')
          const fromStyle = style?.initializer && ts.isJsxExpression(style.initializer) ? background(style.initializer.expression) : null
          const filled = !!fromStyle || tokens.some((one) => /^bg-(?!clip|linear|radial|conic|none|transparent)/.test(plain(one) ?? ''))
          const bad = tokens.filter((one) => {
            const base = plain(one)
            if (!base || !SEE_THROUGH_CLASS.test(base) || /--mf-window-tint|gradient\(/.test(base)) return false
            // Opacity faded in and out with a state is fine; a filled surface left part see-through is not.
            return !base.startsWith('opacity-') || filled
          })
          if (fromStyle && SEE_THROUGH_VALUE.test(fromStyle) && !/gradient\(|--mf-window-tint/.test(fromStyle)) bad.push(`style ${fromStyle}`)
          if (bad.length) found.push(`${name}:${line}  ${bad.join(' ')}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(found, [], `A floating surface must be opaque (bg-popover, bg-background, or a tint mixed into var(--background)):\n${found.join('\n')}`)
})
