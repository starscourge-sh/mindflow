import { toast } from '@/components/haligtree/ui'
import { SANDBOX } from './sandbox'
import { haligtree, type Settings } from './haligtree'
import { APP_NAME } from '../../../main/name'

/**
 * Which of Haligtree's windows show in screen shares, recordings and screenshots.
 * Each kind has its own switch in Settings (all hidden to start); ⌘K and the
 * box's menu turn them all on or off at once.
 */
export type Recordings = Settings['inRecordings']
export const RECORDING_KINDS = ['main', 'box', 'stickies', 'bubble'] as const
const HIDDEN: Recordings = { main: false, box: false, stickies: false, bubble: false }

/** Every window shows in recordings. */
export const allRecorded = (seen: Recordings | undefined): boolean => RECORDING_KINDS.every((kind) => seen?.[kind] === true)

/** All shown or all hidden, at once, saying so, undoable back to how each was. */
export function recordAll(on: boolean, was: Recordings | undefined): void {
  const all = Object.fromEntries(RECORDING_KINDS.map((kind) => [kind, on])) as Recordings
  void haligtree.setSettings({ inRecordings: all })
  toast(on ? `All of ${APP_NAME} shows in screen recordings` : `All of ${APP_NAME} is hidden from screen recordings`, () => void haligtree.setSettings({ inRecordings: { ...HIDDEN, ...was } }))
}

/**
 * Once: the one switch this used to be ("Show Haligtree in screen recordings",
 * kept in the window's own storage) and its "Except sticky notes", moved
 * into the settings as a switch for each kind of window, so nothing you
 * chose changes. Hidden stays hidden; shown stays shown, sticky notes as
 * they were.
 */
export async function moveOldRecordable(): Promise<void> {
  let old: string | null = null
  try {
    old = localStorage.getItem('recordable')
  } catch {
    return
  }
  if (old === null) return
  // The sandbox wears what it was given when it was set out, not an old flag of its own.
  if (old === 'on' && !SANDBOX) {
    const now = (await haligtree.settings()) as Settings & { stickiesUnshared?: boolean }
    await haligtree.setSettings({ inRecordings: { main: true, box: true, bubble: true, stickies: now.stickiesUnshared === false } })
  }
  // Off was hidden from everything: kept so, now that a new book starts shown.
  if (old === 'off' && !SANDBOX) await haligtree.setSettings({ inRecordings: HIDDEN })
  try {
    localStorage.removeItem('recordable')
  } catch {
    // Asked again next time; the same answer.
  }
}
