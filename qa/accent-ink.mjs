// The ink on accent fills, picked by the stylesheet from the accent's
// lightness (assets/main.css, .mf-on-accent and --primary-foreground): for
// every theme, in Soft and Brutal, the accent's oklch L, the ink drawn on it
// and its contrast. One L must split every dark ink from every white one, and
// each must read at 4.5:1 or better. Before the stylesheet did it, a script
// picked by contrast (lib/on-accent.ts); this probe showed the two agree.
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/accent-ink.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const THEMES = ['github', 'midnight', 'paper', 'dark', 'light', 'catppuccin', 'dracula', 'gruvbox', 'tokyonight', 'obsidian-nord', 'everforest', 'kanagawa', 'adwaita', 'rose-pine']
const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const { h } = c
const rows = []
try {
  for (const style of ['soft', 'brutal']) {
    await h.evaluate((one) => localStorage.setItem('style', one), style)
    for (const theme of THEMES) {
      await c.theme(theme)
      rows.push(await h.evaluate(([theme, style]) => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 })
        const pen = canvas.getContext('2d', { willReadFrequently: true })
        const rgb = (css) => ((pen.clearRect(0, 0, 1, 1)), (pen.fillStyle = '#000'), (pen.fillStyle = css), pen.fillRect(0, 0, 1, 1), [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3))
        const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
        const probe = document.createElement('span')
        document.body.append(probe)
        const read = (css) => ((probe.style.color = css), getComputedStyle(probe).color)
        const lOf = (css) => { probe.style.color = `oklch(from ${css} l 0 0)`; const m = /oklch\(([\d.]+)/.exec(getComputedStyle(probe).color); return m ? Number(m[1]) : NaN }
        const out = []
        const onAccent = Object.assign(document.createElement('span'), { className: 'mf-on-accent' })
        document.body.append(onAccent)
        for (const fill of ['--primary', '--tt-brand-color-400']) {
          const bg = read(`var(${fill})`)
          const fg = fill === '--primary' ? read('var(--primary-foreground)') : getComputedStyle(onAccent).color
          out.push({ theme, style, fill, L: Math.round(lOf(`var(${fill})`) * 1000) / 1000, white: lum(rgb(fg)) > 0.5, ratio: Math.round(ratio(rgb(bg), rgb(fg)) * 100) / 100 })
        }
        probe.remove()
        onAccent.remove()
        return out
      }, [theme, style]))
    }
  }
  const all = rows.flat()
  for (const one of all) console.log(`${one.style.padEnd(6)} ${one.theme.padEnd(14)} ${one.fill.padEnd(22)} L ${one.L.toFixed(3)}  ${one.white ? 'white' : 'dark '}  ${one.ratio}`)
  const darkest = Math.min(...all.filter((one) => !one.white).map((one) => one.L))
  const lightest = Math.max(...all.filter((one) => one.white).map((one) => one.L))
  check('one lightness splits the dark inks from the white ones', lightest < darkest, `white up to L ${lightest}, dark from L ${darkest}`)
  const faint = all.filter((one) => one.ratio < 4.5)
  check('every accent ink reads at 4.5:1 or more', !faint.length, faint.map((one) => `${one.style} ${one.theme} ${one.fill} ${one.ratio}`).join(', '))
} catch (error) {
  check('ran to the end', false, error?.stack ?? error)
} finally {
  await c.close()
}
done()
