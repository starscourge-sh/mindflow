/**
 * Which Macs get which feature: the one record, read by main and the page alike.
 * Every feature that leans on the Mac says what it needs; a Mac that lacks it is
 * never offered the feature as if it worked (lib/needs.ts in the page,
 * Studio/research/mac-features.md for people).
 *   every    every Mac Haligtree runs on
 *   macos15  macOS 15 or later
 *   macos26  macOS 26 or later
 *   ai       Apple Intelligence turned on: Apple silicon and macOS 26
 */
export type Need = 'every' | 'macos15' | 'macos26' | 'ai'

/** What this Mac has, asked once at start (understand.ts). */
export type Caps = {
  macos: string
  major: number
  silicon: boolean
  /** The languages whose sentences can be compared by meaning. */
  embeddings: string[]
  /** "available", or why not: "not-enabled", "not-eligible", "not-ready", "too-old". */
  ai: string
  translation: boolean
}

export function meets(caps: Caps | null, need: Need | undefined): boolean {
  if (!need || need === 'every') return true
  if (!caps) return false
  if (need === 'macos15') return caps.major >= 15
  if (need === 'macos26') return caps.major >= 26
  return caps.major >= 26 && caps.ai === 'available'
}

/** Which Macs, said quietly on a feature that works here. */
export const WHICH: Record<Need, string> = {
  every: 'Every Mac',
  macos15: 'macOS 15 and later',
  macos26: 'macOS 26 and later',
  ai: 'Macs with Apple Intelligence'
}

/** Said, once and plainly, where a feature this Mac lacks would be. */
export function lacks(caps: Caps | null, need: Need): string {
  if (need === 'ai' && caps && caps.major >= 26) {
    if (caps.ai === 'not-enabled') return 'Needs Apple Intelligence, turned on in System Settings'
    if (caps.ai === 'not-ready') return 'Apple Intelligence is still getting ready on this Mac'
  }
  return { every: '', macos15: 'Needs macOS 15', macos26: 'Needs macOS 26', ai: 'Needs Apple Intelligence' }[need]
}

/** What a QA run stands in for this Mac (HALIGTREE_QA_CAPS), so a probe can check what an older Mac is offered. */
export function standIn(level: string, real: Caps): Caps {
  const at = (major: number, ai: string): Caps => ({ ...real, macos: `${major}.0`, major, ai, translation: major >= 26 })
  if (level === 'every') return at(14, 'too-old')
  if (level === 'macos15') return at(15, 'too-old')
  if (level === 'macos26') return at(26, 'not-enabled')
  if (level === 'ai') return { ...at(26, 'available'), silicon: true }
  return real
}
