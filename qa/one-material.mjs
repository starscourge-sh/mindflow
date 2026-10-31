// The written design rules, read back from the real stylesheet (DESIGN.md,
// taste.md): one warm shadow on light themes and a black, fuller one on dark;
// one floating material (fill, ring, shadow) for menus, tooltips, the editor's
// own menus and the note hover card; radius 4 / 8 / 10 / 14 / full; one curve.
// Each primitive is drawn in the main window with the classes its component
// uses (read from the source), and its computed box-shadow, border-radius and
// transition timing are checked.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/one-material.mjs
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-one-material-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()

const SRC = new URL('../src/renderer/src/', import.meta.url).pathname
const read = (file) => readFileSync(join(SRC, file), 'utf8')
const float = read('lib/float.ts')
const FLOAT = float.match(/export const FLOAT = '([^']+)'/)[1]
const CARD = float.match(/export const CARD = [`'](.+)[`']/)[1].replace('${FLOAT}', FLOAT)
const TIP = float.match(/export const TIP = `(.+)`/)[1].replace('${FLOAT}', FLOAT)
const button = read('components/ui/button.tsx')
const BASE = button.match(/cva\(\s*"([^"]+)"/)[1]
const XS = button.match(/\bxs: "([^"]+)"/)[1]
const ICON_XS = button.match(/"icon-xs": "([^"]+)"/)[1]
const CHIPS = read('components/haligtree/display.tsx').match(/className=\{`(rounded-\S+) px-2 py-1 text-xs/)?.[1] ?? 'missing'
const PEEK = read('home.tsx').match(/shadow-\(--mf-panel-shadow\) transition-\[opacity,transform\] duration-200 (ease-\S+)/)?.[1] ?? 'missing'
const KIT = readFileSync(join(process.env.HOME, '.claude/skills/app-playbook/studio-kit.md'), 'utf8')

// Ease-out curves that are the one curve in all but name: every one of them
// should read --mf-ease (or EASE in script). A curve that overshoots (a spring's
// settle, y above 1) or eases in and out (a loop, a flight) is its own motion.
const strays = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(tsx?|s?css)$/.test(name)) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        for (const [, a, b, c, d] of line.matchAll(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)) {
          const [x1, y1, x2, y2] = [a, b, c, d].map(Number)
          const one = x1 === 0.16 && y1 === 1 && x2 === 0.3 && y2 === 1
          const easeOut = x1 < 0.4 && y1 >= 0.6 && y1 <= 1 && y2 === 1 && !(x1 >= 0.3 && y1 <= 0.7)
          if (!one && easeOut) strays.push(`${path.slice(SRC.length)}:${i + 1} ${a},${b},${c},${d}`)
        }
      })
    }
  }
}
walk(SRC)

const c = await sandbox({ width: 1200, height: 800 })
const { h, look, close } = c
try {
  for (const theme of ['paper', 'light', 'dark']) {
    await look(theme)
    const got = await h.evaluate(({ FLOAT, CARD, TIP, BASE, XS, ICON_XS, CHIPS, PEEK }) => {
      const made = []
      const make = (tag, attrs = {}) => {
        const el = document.createElement(tag)
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
        el.textContent = 'x'
        document.body.append(el)
        made.push(el)
        return getComputedStyle(el)
      }
      const panel = make('div', { style: 'box-shadow: var(--mf-panel-shadow)' }).boxShadow
      const out = {
        light: document.documentElement.hasAttribute('data-light'),
        panel,
        float: make('div', { class: FLOAT }).boxShadow,
        card: make('div', { class: CARD }),
        tip: make('div', { class: TIP }),
        ttMenu: make('div', { class: 'tiptap-dropdown-menu-content' }),
        ttSub: make('div', { class: 'tiptap-dropdown-menu-sub-content' }).boxShadow,
        ttCard: make('div', { class: 'tiptap-card' }).boxShadow,
        ttTip: make('div', { class: 'tiptap-tooltip' }),
        ttBar: make('div', { class: 'tiptap-toolbar', 'data-variant': 'floating' }).boxShadow,
        sm: make('div', { class: 'rounded-sm' }).borderRadius,
        md: make('div', { class: 'rounded-md' }).borderRadius,
        lg: make('div', { class: 'rounded-lg' }).borderRadius,
        xl: make('div', { class: 'rounded-xl' }).borderRadius,
        button: make('button', { class: BASE }).transitionTimingFunction,
        xs: make('button', { class: `${BASE} ${XS}` }).borderRadius,
        iconXs: make('button', { class: `${BASE} ${ICON_XS}` }).borderRadius,
        chips: make('button', { class: CHIPS }).borderRadius,
        peek: make('div', { class: `transition-[opacity,transform] duration-200 ${PEEK}` }).transitionTimingFunction,
        ease: getComputedStyle(document.documentElement).getPropertyValue('--mf-ease').trim(),
        // Corners are in rem, so they grow with the app size: read at 100%.
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      }
      const at100 = (v) => parseFloat(v) >= 999 ? 'full' : `${Math.round((parseFloat(v) * 16) / out.rootPx * 10) / 10}px`
      for (const key of ['card', 'tip', 'ttMenu', 'ttTip']) out[key] = { shadow: out[key].boxShadow, radius: at100(out[key].borderRadius) }
      for (const key of ['sm', 'md', 'lg', 'xl', 'xs', 'iconXs', 'chips']) out[key] = at100(out[key])
      made.forEach((el) => el.remove())
      return out
    }, { FLOAT, CARD, TIP, BASE, XS, ICON_XS, CHIPS, PEEK })
    const t = `[${theme}]`
    // Alphas of each layer, in order, as the browser resolved them.
    const alphas = (shadow) => [...shadow.matchAll(/\/ ([\d.]+)\)/g)].map((m) => Number(m[1]))
    const black = (shadow) => /oklab\(0 0 0 \//.test(shadow) || /rgba\(0, 0, 0,/.test(shadow)
    const [first, second] = alphas(got.panel)
    if (theme === 'dark') {
      check(`${t} the panel shadow is black and fuller (40%, 62%)`, black(got.panel) && first === 0.4 && second === 0.62, got.panel)
    } else {
      check(`${t} the panel shadow is the warm ink at 16% and 32%, not black`, got.light && !black(got.panel) && first === 0.16 && second === 0.32, got.panel)
    }
    const ring = (shadow) => shadow.replace(got.panel, '').trim()
    // The same layers in any order, Tailwind's empty placeholder layers left out.
    const layers = (shadow) => shadow.split(/,(?![^(]*\))/).map((one) => one.trim()).filter((one) => !one.startsWith('rgba(0, 0, 0, 0) 0px 0px 0px 0px')).sort().join(' | ')
    const same = (x, y) => layers(x) === layers(y)
    check(`${t} the tiptap menu casts the panel shadow and the ring`, same(got.ttMenu.shadow, got.float), got.ttMenu.shadow)
    check(`${t} the tiptap submenu casts the panel shadow and the ring`, same(got.ttSub, got.float), got.ttSub)
    check(`${t} the tiptap card casts the panel shadow`, got.ttCard.includes(got.panel), got.ttCard)
    check(`${t} the tiptap floating toolbar casts the panel shadow`, got.ttBar.includes(got.panel), got.ttBar)
    check(`${t} the tiptap tooltip casts the panel shadow and the ring`, same(got.ttTip.shadow, got.float), got.ttTip.shadow)
    check(`${t} the hover card (CARD) is the same material as FLOAT`, same(got.card.shadow, got.float), `${got.card.shadow} vs ${got.float}`)
    check(`${t} FLOAT is the panel shadow and one ring`, got.float.includes(got.panel) && ring(got.float).length > 0, ring(got.float))
    if (theme !== 'paper') continue
    check('radius-sm is 4px', got.sm === '4px', got.sm)
    check('radius md / lg / xl are 8 / 10 / 14', got.md === '8px' && got.lg === '10px' && got.xl === '14px', `${got.md} ${got.lg} ${got.xl}`)
    check('the hover card (CARD) is 14px', got.card.radius === '14px', got.card.radius)
    check('the tooltip (TIP) and the tiptap tooltip are 8px', got.tip.radius === '8px' && got.ttTip.radius === '8px', `${got.tip.radius} ${got.ttTip.radius}`)
    check('the tiptap menu is 10px, as a menu', got.ttMenu.radius === '10px', got.ttMenu.radius)
    check('xs buttons are 8px, as buttons', got.xs === '8px' && got.iconXs === '8px', `${got.xs} ${got.iconXs}`)
    check('single-choice Chips rows are fully round, as chips', got.chips === 'full', got.chips)
    check('the Button moves on the one curve', got.button === got.ease.replace(/\s+/g, ' ') || got.button === 'cubic-bezier(0.16, 1, 0.3, 1)', got.button)
    check('the sidebar peek moves on the one curve', got.peek === 'cubic-bezier(0.16, 1, 0.3, 1)', got.peek)
  }
  check('no stray ease-out cubic-bezier outside --mf-ease / EASE', strays.length === 0, `${strays.length}: ${strays.slice(0, 6).join('; ')}`)
  check("studio-kit's chip entry says fully round", /chips? fully round/.test(KIT))
  check("theme.ts's comment names the real default (Paper)", /default \(Paper\)/.test(read('lib/theme.ts')))
} catch (e) {
  check('ran without an error', false, e.message)
} finally {
  await close()
}
done()
