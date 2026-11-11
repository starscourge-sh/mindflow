import { still } from './motion'

/**
 * How a thing let go of comes to rest, the one way for every swipe, pinch and
 * scroll that lands on a stop (the Calendar's weeks and its levels, the
 * Journal's year): where it would have stopped is read from
 * its speed at the lift, the nearest stop to that is chosen, and a spring
 * with no bounce takes it there, stepped by the real time each frame took.
 * A new touch stops the spring where it is; sent somewhere else on the way, it
 * turns from where it is with the speed it has.
 */

/** A firm landing: at rest an eighth of a second after it is let go, from half a week away or a whole one. */
export const FIRM = 3200
/** A calm glide, for a place the app takes you to (an arrow, “Today”): a month's weeks in just over a quarter of a second, slow enough to follow. */
export const CALM = 1200

/** Past an edge, less and less follows: the further over, the harder it pulls back. */
export const rubber = (over: number, room: number, give = 0.55): number => (over * room * give) / (room + give * Math.abs(over))

/**
 * One spring step, critically damped: no bounce, settles from wherever it is now, with the speed it has. Worked out
 * exactly for the time given, however long: the same landing at 60 or 120 frames a second and on a busy machine,
 * where a frame can take 100ms (added up in small steps it came to rest about a tenth later than its stiffness says).
 */
export const step = (at: number, speed: number, to: number, dt: number, stiff = 170): [number, number] => {
  const pull = Math.sqrt(stiff)
  const gap = at - to
  const drift = speed + pull * gap
  const fade = Math.exp(-pull * dt)
  return [to + (gap + drift * dt) * fade, (speed - pull * drift * dt) * fade]
}

/** The spring over however long the last frame took. Over half a second (a window put away and back) it simply lands. */
export const spring = (at: number, speed: number, to: number, elapsed: number, stiff?: number): [number, number] =>
  elapsed > 0.5 ? [to, 0] : step(at, speed, to, elapsed, stiff)

/** Where a thing moving at `speed` (per second) would stop if left to slow on its own for `glide` seconds' worth of travel. */
export const project = (at: number, speed: number, glide = 0.12): number => at + speed * glide

/** The stop a thing let go at `at` with `speed` should land on: the one nearest to where it was heading, `size` apart. */
export const stopFor = (at: number, speed: number, size: number, glide?: number): number => Math.round(project(at, speed, glide) / size) * size

/**
 * The most speed the spring may start with and still never pass its stop: a critically damped spring let go faster
 * than its own pull over the gap runs past and comes back, which reads as a wobble.
 */
export const noPass = (at: number, speed: number, to: number, stiff = FIRM): number => {
  const gap = to - at
  if (Math.sign(speed) !== Math.sign(gap)) return speed
  const most = Math.sqrt(stiff) * Math.abs(gap) * 0.95
  return Math.abs(speed) > most ? Math.sign(speed) * most : speed
}

export type Landing = {
  stop: () => void
  /** Sent to another stop on the way: it goes on from where it is, keeping its speed (or `speed`, when it is already going that way and that is faster). */
  aim: (to: number, speed?: number) => void
  readonly at: number
  readonly to: number
  readonly running: boolean
}

/**
 * Takes a value from `at` to `to` with the firm spring, starting at `speed` (per second), writing each frame's value
 * through `write`; `done(landed)` once, true when it reached the stop and false when stopped on the way. With Motion
 * off or Reduce motion it is there at once.
 */
export function land(at: number, speed: number, to: number, write: (value: number) => void, done: (landed: boolean) => void, stiff = FIRM): Landing {
  let frame = 0
  let running = true
  const finish = (landed: boolean): void => {
    if (!running) return
    running = false
    cancelAnimationFrame(frame)
    done(landed)
  }
  if (still() || Math.abs(to - at) < 0.5) {
    write(to)
    finish(true)
    return { stop: () => {}, aim: () => {}, at: to, to, running: false }
  }
  speed = noPass(at, speed, to, stiff)
  let then = performance.now()
  const tick = (now: number): void => {
    ;[at, speed] = spring(at, speed, to, Math.max(0, (now - then) / 1000), stiff)
    then = now
    if (Math.abs(to - at) < 0.5 && Math.abs(speed) < 20) return void (write(to), finish(true))
    write(at)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return {
    stop: () => finish(false),
    aim: (next, faster = 0) => {
      if (!running) return
      to = next
      // Its own speed is carried through, raised to the faster one only when it is already going that way: sent back
      // the way it came, the spring does the turning (a speed swapped for its opposite in one frame reads as a knock).
      const way = Math.sign(to - at)
      if (Math.sign(speed) === way && Math.sign(faster) === way && Math.abs(faster) > Math.abs(speed)) speed = faster
      speed = noPass(at, speed, to, stiff)
    },
    get at() { return at },
    get to() { return to },
    get running() { return running }
  }
}
