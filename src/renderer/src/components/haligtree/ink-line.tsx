import { useEffect, useRef, useState } from 'react'

import { chime } from '@/lib/sound'
import { typing } from './ui'

/**
 * A game for an empty Review, found by typing "play" there and mentioned
 * nowhere else but the eggs' list (welcome-eggs.ts). A line of ink that
 * grows with each blot it reaches, steered with the arrows or WASD; Space
 * pauses or starts again, Esc puts it away. Its sounds are Haligtree's own, so
 * they keep to the sound setting.
 */
const WORD = 'play'
const COLS = 24
const ROWS = 15
const CELL = 20
type Cell = { x: number; y: number }
const STEPS: Record<string, Cell> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }
}

/** Listens for the word on the page it sits on, then lays the game over it. */
export function InkLine(): React.JSX.Element | null {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let heard = ''
    const onKey = (event: KeyboardEvent): void => {
      if (on || event.metaKey || event.ctrlKey || event.altKey || typing() || event.key.length !== 1) return
      heard = (heard + event.key.toLowerCase()).slice(-WORD.length)
      if (heard !== WORD) return
      heard = ''
      chime('open')
      setOn(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
  return on ? <Board onLeave={() => (chime('away'), setOn(false))} /> : null
}

function Board({ onLeave }: { onLeave: () => void }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [blots, setBlots] = useState(0)
  const [state, setState] = useState<'ready' | 'going' | 'paused' | 'over'>('ready')
  const game = useRef({ line: [] as Cell[], heading: { x: 1, y: 0 }, next: [] as Cell[], blot: { x: 0, y: 0 }, eaten: 0 })

  const place = (): Cell => {
    const { line } = game.current
    for (;;) {
      const spot = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
      if (!line.some((one) => one.x === spot.x && one.y === spot.y)) return spot
    }
  }
  const reset = (): void => {
    const y = Math.floor(ROWS / 2)
    game.current = { line: [{ x: 6, y }, { x: 5, y }, { x: 4, y }], heading: { x: 1, y: 0 }, next: [], blot: { x: 0, y: 0 }, eaten: 0 }
    game.current.blot = place()
    setBlots(0)
  }

  const draw = (): void => {
    const paper = canvas.current
    const pen = paper?.getContext('2d')
    if (!paper || !pen) return
    const ink = getComputedStyle(paper).color
    const ratio = window.devicePixelRatio || 1
    pen.setTransform(ratio, 0, 0, ratio, 0, 0)
    pen.clearRect(0, 0, COLS * CELL, ROWS * CELL)
    const { line, blot } = game.current
    const mid = (cell: Cell): [number, number] => [cell.x * CELL + CELL / 2, cell.y * CELL + CELL / 2]
    // The blot: a round drop, a little faded, with a second smaller one beside it.
    pen.fillStyle = ink
    pen.globalAlpha = 0.85
    pen.beginPath()
    pen.arc(...mid(blot), CELL * 0.26, 0, Math.PI * 2)
    pen.fill()
    pen.globalAlpha = 0.5
    pen.beginPath()
    pen.arc(mid(blot)[0] + CELL * 0.28, mid(blot)[1] - CELL * 0.22, CELL * 0.08, 0, Math.PI * 2)
    pen.fill()
    // The line: drawn tail to head, thinning toward the tail like a pen running dry.
    pen.lineCap = 'round'
    pen.lineJoin = 'round'
    pen.strokeStyle = ink
    for (let at = line.length - 1; at > 0; at--) {
      pen.globalAlpha = 0.55 + 0.45 * (1 - at / line.length)
      pen.lineWidth = CELL * (0.22 + 0.24 * (1 - at / line.length))
      pen.beginPath()
      pen.moveTo(...mid(line[at]))
      pen.lineTo(...mid(line[at - 1]))
      pen.stroke()
    }
    pen.globalAlpha = 1
    pen.beginPath()
    pen.arc(...mid(line[0]), CELL * 0.25, 0, Math.PI * 2)
    pen.fill()
  }

  const step = (): void => {
    const now = game.current
    const turn = now.next.shift()
    if (turn) now.heading = turn
    const head = { x: now.line[0].x + now.heading.x, y: now.line[0].y + now.heading.y }
    const ate = head.x === now.blot.x && head.y === now.blot.y
    const body = ate ? now.line : now.line.slice(0, -1)
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((one) => one.x === head.x && one.y === head.y)) {
      chime('again')
      setState('over')
      return
    }
    now.line = [head, ...body]
    if (ate) {
      now.eaten += 1
      setBlots(now.eaten)
      chime('bead')
      now.blot = place()
    }
    draw()
  }

  // The paper sized for a sharp line on any screen.
  useEffect(() => {
    const paper = canvas.current
    if (!paper) return
    const ratio = window.devicePixelRatio || 1
    paper.width = COLS * CELL * ratio
    paper.height = ROWS * CELL * ratio
    reset()
    draw()
  }, [])

  // A steady pace that quickens a little with every blot, and stops when the window is hidden.
  useEffect(() => {
    if (state !== 'going') return
    let timer = 0
    const tick = (): void => {
      if (document.hidden) return setState('paused')
      step()
      timer = window.setTimeout(tick, Math.max(70, 140 - game.current.eaten * 3))
    }
    timer = window.setTimeout(tick, 140)
    return () => window.clearTimeout(timer)
  }, [state])

  // Its keys before anyone else's, Esc above all, so nothing behind it moves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      event.preventDefault()
      event.stopImmediatePropagation()
      if (key === 'Escape') return onLeave()
      if (key === ' ') {
        if (state === 'over') reset()
        if (state === 'over' || state === 'ready') chime('tap')
        draw()
        return setState(state === 'going' ? 'paused' : 'going')
      }
      const way = STEPS[key]
      if (!way) return
      if (state === 'ready' || state === 'paused') setState('going')
      if (state === 'over') return
      // Turns queue up, two at most, and never straight back on itself.
      const now = game.current
      const last = now.next[now.next.length - 1] ?? now.heading
      if (now.next.length < 2 && way.x !== -last.x && way.y !== -last.y) now.next.push(way)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [state])

  const said = state === 'over' ? 'The line ran into itself. Space for another.' : state === 'paused' ? 'Paused. Space goes on.' : state === 'ready' ? 'An arrow key or Space starts it.' : null
  return (
    <div data-ink-line="" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onMouseDown={onLeave}>
      <div role="dialog" aria-modal="true" aria-label="Ink line" className="rounded-xl bg-popover p-5 text-foreground shadow-(--mf-panel-shadow)" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-baseline justify-between gap-6">
          <h2 className="font-serif text-xl">Ink line</h2>
          <span className="text-base tabular-nums">{blots} {blots === 1 ? 'blot' : 'blots'}</span>
        </div>
        <canvas ref={canvas} aria-label="The game board" className="block rounded-md border bg-background text-foreground" style={{ width: COLS * CELL, height: ROWS * CELL }} />
        <p className="mt-3 min-h-6 text-base">{said && <strong className="font-medium">{said}</strong>}</p>
        <p className="text-sm text-muted-foreground">Arrows or WASD steer. Space pauses. Esc leaves.</p>
      </div>
    </div>
  )
}
