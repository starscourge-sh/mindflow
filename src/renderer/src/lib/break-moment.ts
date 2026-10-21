import { vigil } from '@/lib/vigil'

/**
 * A break is the one moment you are told to stop working, so it is a good
 * moment for one thing to come back: the session bubble shows a single card
 * while the break runs, skippable, never in the work part. What it shows
 * comes from the sources below, asked in turn until one has something; each
 * is gated by the main process as every hint is (nothing in safe mode, no
 * private ones). Another kind of card (a practice, say) is one more source:
 * `addBreakSource`.
 */
export type BreakMoment = {
  /** What it is, said over its words: “A year ago today”, “A gem”. */
  label: string
  text: string
  /** Where a click on it opens it in the main window, if anywhere. */
  open?: { type: string; id: string }
  /** The hint event it was logged as, so how long it stayed is kept as a hint's is. */
  event?: number
}
export type BreakSource = () => Promise<BreakMoment | null>

/** A body's words, short: the stored title is usually its first line already. */
const wordsOf = (title: string | undefined, body: unknown): string => {
  if (title?.trim()) return title.trim()
  if (typeof body === 'string') return body.trim()
  const walk = (node: { text?: string; content?: unknown[] } | null | undefined): string =>
    !node ? '' : node.text ?? (node.content ?? []).map((one) => walk(one as typeof node)).join(' ')
  return walk(body as { content?: unknown[] }).trim()
}

/** A line from a year ago (or this week in another year, or one source's things): Photos' memories. */
const memory: BreakSource = async () => {
  const one = await vigil.memory().catch(() => null)
  const text = one ? wordsOf(one.title, one.body) : ''
  return one && text ? { label: one.memory, text, open: { type: one.id === one.captureId ? 'capture' : 'nugget', id: one.id }, event: one.event } : null
}

/** A gem to recall: one kept thing, the way the box's hints pick it. */
const gem: BreakSource = async () => {
  const one = await window.api.hints.next().catch(() => null)
  if (!one) return null
  const text = wordsOf(one.title as string | undefined, one.body)
  const capture = one.id === (one as { captureId?: string }).captureId
  return text ? { label: capture ? 'From a while back' : 'A gem', text, open: { type: capture ? 'capture' : ((one as { tier?: string }).tier ?? 'nugget'), id: one.id }, event: one.event } : null
}

const sources: BreakSource[] = [memory, gem]

/** One more kind of break card, asked before the others with `first`. */
export function addBreakSource(source: BreakSource, first = false): () => void {
  if (first) sources.unshift(source)
  else sources.push(source)
  return () => void sources.splice(sources.indexOf(source), 1)
}

/** The card for this break, or null when nothing has one to give. */
export async function breakMoment(): Promise<BreakMoment | null> {
  for (const source of sources) {
    const found = await source().catch(() => null)
    if (found) return found
  }
  return null
}
