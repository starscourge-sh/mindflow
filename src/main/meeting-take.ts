/**
 * What to take from a meeting, as Apple Intelligence wrote it (native/meeting.swift asks for five headed lists, each
 * line keeping its "[12s]"), read into lists whose lines play from their moment. A recording read again (meeting.ts
 * `readAgain`, filled as a shape since 20 Nov) and a probe's stand-in come already in lists; the headed text stays read
 * for meetings kept before. Null when there is none: the page then shows the lines found instead.
 */
export type TakeLine = { text: string; at: number; owner?: string; date?: string | null }
export type Take = { summary: string; decisions: TakeLine[]; actions: TakeLine[]; questions: TakeLine[]; missed: TakeLine[]; standIn: boolean }

const HEADS: Record<string, keyof Omit<Take, 'summary' | 'standIn'> | 'summary'> = {
  summary: 'summary', decisions: 'decisions', actions: 'actions', 'open questions': 'questions', 'about you': 'missed'
}

export function readTake(raw: Record<string, unknown> | null | undefined): Take | null {
  if (!raw) return null
  const list = (value: unknown): TakeLine[] => (Array.isArray(value) ? (value as TakeLine[]).filter((one) => one && typeof one.text === 'string') : [])
  if (typeof raw.text !== 'string') {
    return { summary: String(raw.summary ?? ''), decisions: list(raw.decisions), actions: list(raw.actions), questions: list(raw.questions), missed: list(raw.missed), standIn: !!raw.standIn }
  }
  const take: Take = { summary: '', decisions: [], actions: [], questions: [], missed: [], standIn: false }
  let under: keyof typeof HEADS | null = null
  for (const row of raw.text.split('\n')) {
    const head = /^[#*\s]*([a-z ]+?)[:*\s]*$/i.exec(row.trim())?.[1]?.toLowerCase()
    if (head && head in HEADS) { under = head; continue }
    const words = row.replace(/^\s*[-•*]\s*/, '').trim()
    if (!under || !words || /^none\.?$/i.test(words)) continue
    if (HEADS[under] === 'summary') { take.summary = `${take.summary} ${words}`.trim(); continue }
    const at = Number(/\[(\d+)s\]/.exec(words)?.[1] ?? 0)
    const owner = /^\[([^\]]+?)\]\s*/.exec(words)
    const text = words.replace(/\[\d+s\]/g, '').replace(/^\[[^\]]+\]\s*/, '').trim()
    ;(take[HEADS[under] as 'decisions'] as TakeLine[]).push({ text, at, ...(owner && !/^\d+s$/.test(owner[1]) ? { owner: owner[1] } : {}) })
  }
  return take
}
