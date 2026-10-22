/**
 * Figures drawn on a 5 by 7 grid of dots, the way a clock's display or a
 * station board shows them: lit dots in the text colour, the unlit ones a
 * faint ghost of it, so the grid itself is always there. A dot keeps its place
 * from one figure to the next and only fades on or off, so a ticking clock
 * changes just the dots that differ. With Motion off it simply switches.
 */

/** Each figure as seven rows of five dots, top to bottom. */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0']
}

export function DotMatrix({ text, className = '' }: { text: string; className?: string }): React.JSX.Element {
  // Laid out left to right, a column of space between figures.
  const dots: { x: number; y: number; on: boolean; key: string }[] = []
  let x = 0
  for (const [index, char] of [...text].entries()) {
    const glyph = GLYPHS[char] ?? GLYPHS['0'].map((row) => row.replace(/1/g, '0'))
    glyph.forEach((row, y) => [...row].forEach((bit, column) => dots.push({ x: x + column, y, on: bit === '1', key: `${index}-${column}-${y}` })))
    x += glyph[0].length + 1
  }
  const width = Math.max(1, x - 1)
  return (
    <span role="img" aria-label={text} className={`inline-flex ${className}`}>
      <svg aria-hidden viewBox={`0 0 ${width} 7`} className="h-full w-auto overflow-visible" style={{ aspectRatio: `${width} / 7` }}>
        {dots.map((dot) => (
          <circle key={dot.key} cx={dot.x + 0.5} cy={dot.y + 0.5} r={0.42} fill="currentColor"
            className="transition-opacity duration-150 ease-(--mf-ease)" style={{ opacity: dot.on ? 1 : 0.1 }} />
        ))}
      </svg>
    </span>
  )
}
