/**
 * When each step of starting was reached, in ms from the start of this run (Node's clock starts with the process):
 * main's code read, the app ready, the book open, the main window made, painted, drawn and shown, and quick capture
 * made and drawn. What the sandbox's opening probe and qa/start-time.mjs read. Imported first, so `first` is the
 * moment main's own code began to run.
 */
export const startTimes: Partial<Record<'first' | 'code' | 'ready' | 'book' | 'made' | 'painted' | 'drawn' | 'shown' | 'box' | 'boxDrawn', number>> = { first: Math.round(performance.now()) }
;(globalThis as { haligtreeHomeTimes?: typeof startTimes }).haligtreeHomeTimes = startTimes

/** A step reached: kept the first time only. */
export const reached = (step: keyof typeof startTimes): void => void (startTimes[step] ??= Math.round(performance.now()))
