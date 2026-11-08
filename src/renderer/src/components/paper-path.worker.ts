// Works out PaperCrumple's fold path off the page's thread (paper-path.ts), so
// a move to the Bin never waits on it: about a quarter second of sums a shape.
import { createPaperPath, paperMesh } from './paper-path'

export type PathAsk = { key: string; width: number; height: number; detail: number; folds: number; sharpness: number; depth: number; seed: number }

/** The worker's own scope, typed by hand: the webworker lib would retype the whole app's events. */
const scope = self as unknown as { onmessage: (event: MessageEvent<PathAsk>) => void; postMessage: (message: unknown, transfer: ArrayBuffer[]) => void }

scope.onmessage = (event) => {
  const { key, width, height, detail, folds, sharpness, depth, seed } = event.data
  const { shortSide, original, indices } = paperMesh(width, height, detail, seed)
  const { samples, creased } = createPaperPath(original, indices, shortSide, folds, sharpness, depth, seed)
  scope.postMessage({ key, samples, creased }, [...samples.map((one) => one.buffer as ArrayBuffer), creased.buffer as ArrayBuffer])
}
