// Every coloured chip (a tag, a lit word in quick capture) is readable: its words reach 4.5:1 against the chip they
// sit on, in every theme, light and dark, with highlights "Soft" or "Rich", for every colour.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/chip-contrast.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 900, height: 600 })
const { h, errors, close } = c
const THEMES = ['light', 'dark', 'paper', 'midnight', 'gruvbox', 'kanagawa', 'tokyonight', 'catppuccin', 'adwaita', 'dracula', 'everforest', 'github', 'obsidian-nord', 'rose-pine']
try {
  const worst = []
  for (const theme of THEMES) {
    await c.theme(theme)
    for (const weight of ['soft', 'rich']) {
      const got = await h.evaluate((weight) => {
        if (weight === 'rich') document.documentElement.setAttribute('data-highlights', 'rich')
        else document.documentElement.removeAttribute('data-highlights')
        // Any CSS colour (oklab, color-mix, hsl) as sRGB, read back from a canvas.
        const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
        const parse = (css) => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1)
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
          return { r, g, b, a: a / 255 }
        }
        const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
        const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
        const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) }
        const page = parse(getComputedStyle(document.documentElement).getPropertyValue('--background').trim())
        const out = []
        for (const hue of ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']) {
          const chip = document.createElement('span')
          chip.setAttribute('data-tag-chip', 'probe')
          chip.style.background = `var(--mf-chip-bg-${hue}, var(--tt-color-highlight-${hue}))`
          chip.style.color = `var(--mf-chip-ink-${hue}, var(--tt-color-text-${hue}))`
          chip.textContent = '#probe'
          document.body.append(chip)
          const s = getComputedStyle(chip)
          const bg = over(parse(s.backgroundColor), page)
          out.push({ hue, ratio: Math.round(ratio(over(parse(s.color), bg), bg) * 100) / 100 })
          chip.remove()
        }
        return out
      }, weight)
      const low = got.reduce((a, b) => (b.ratio < a.ratio ? b : a))
      worst.push(`${theme}/${weight}: ${low.hue} ${low.ratio}`)
      check(`${theme}, ${weight}: every colour's chip reads at 4.5:1 or more`, got.every((one) => one.ratio >= 4.5), got.filter((one) => one.ratio < 4.5).map((one) => `${one.hue} ${one.ratio}`).join(', '))
    }
  }
  console.log('lowest per theme:', worst.join(' | '))
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
