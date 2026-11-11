import { still } from './motion'

/**
 * How a thing let go of comes to rest, the one way for every swipe, pinch and
 * scroll that lands on a stop (the Calendar's weeks and its levels, the
 * Journal's year): where it would have stopped is read from
 * its speed at the lift, the nearest stop to that is chosen, and a spring
 * with no bounce takes it there, stepped by the real time each frame took.
 * A new touch stops the spring where it is.
 */

/** A firm landing: settled in under a fifth of a second from any distance. */
export const FIRM = 1600

/** Past an edge, less and less follows: the further over, the harder it pulls back. */
export const rubber = (over: number, room: number, give = 0.55): number => (over * room * give) / (room + give * Math.abs(over))

/** One spring step, critically damped: no bounce, settles from wherever it is now, with the speed it has. */
export const step = (at: number, speed: number, to: number, dt: number, stiff = 170): [number, number] => {
  const damp = 2 * Math.sqrt(stiff)
  const next = speed + ((to - at) * stiff - damp * speed) * dt
  return [at + next * dt, next]
}

/**
 * The spring over however long the last frame took, in small steps: on a busy machine a frame can take 100ms or more,
 * and a spring held to a frame's worth of time ran in slow motion there. Over half a second (a window put away and
 * back) it simply lands.
 */
export const spring = (at: number, speed: number, to: number, elapsed: number, stiff?: number): [number, number] => {
  if (elapsed > 0.5) return [to, 0]
  const n = Math.max(1, Math.ceil(elapsed * 240))
  for (let i = 0; i < n; i++) [at, speed] = step(at, speed, to, elapsed / n, stiff)
  return [at, speed]
}

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

export type Landing = { stop: () => void; readonly running: boolean }

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
    return { stop: () => {}, running: false }
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
  return { stop: () => finish(false), get running() { return running } }
}
