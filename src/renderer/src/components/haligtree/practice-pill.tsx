import { useEffect, useRef, useState } from 'react'

import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { offerUndo, takeBack } from '@/lib/float-undo'
import { Check, X } from '@/components/ui/icons'
import { IDLE_PAUSE_SEC, START_MIN, fillOf, type Fill } from '../../../../main/practice-rules'
import { practices, type Ended } from '@/lib/practices'
import { haligtree, type Focus } from '@/lib/haligtree'
import { usePatience } from '@/lib/patience'
import { Tip, Typed } from './ui'

/**
 * A practice in the bubble: the pill's bar, the guard against a timer left
 * running, and "What stuck?" as it ends (main/practices.ts).
 * At 5 minutes it asks once whether to keep going (never stops you); at the
 * target the bar says it.
 */

/** Bright gold for the first 5 minutes, the part that counts most. */
const GOLD = 'var(--mf-gold)'
/** Past the 5: a calmer fill of the same gold, a bonus, not a must. */
const CALM = 'color-mix(in oklab, var(--mf-gold) 42%, transparent)'
/** The gold's glow, for the moment at 5 and the target met. */
const GLOW = 'color-mix(in oklab, var(--mf-gold) 55%, transparent)'
const TRACK = 'color-mix(in oklab, var(--foreground) 12%, transparent)'
const CSS = `@keyframes mf-practice-five { 0% { box-shadow: 0 0 0 0 transparent } 30% { box-shadow: 0 0 0 3px color-mix(in oklab, var(--mf-gold) 45%, transparent), 0 0 10px 2px color-mix(in oklab, var(--mf-gold) 50%, transparent) } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes mf-practice-tick { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }`

/** What the stage is, in words, for the line under the time (never the only sign of it). */
export const stageWords = (fill: Fill, target: number): string =>
  fill.stage === 'start' ? `${target} min target` : fill.stage === 'min' ? `${START_MIN} min done` : 'Target reached'

/**
 * The bar: [█████|░░░░░░░░] gold to the notch at 5 minutes, a quiet tick and
 * one brief glow as it passes it (no sound, nothing to answer), a calmer fill
 * on to the target, and a soft glow past it. The notch and the tick say it as
 * well as the colour does.
 */
export function PracticeBar({ ms, target, paused = false }: { ms: number; target: number; paused?: boolean }): React.JSX.Element {
  const fill = fillOf(ms, target)
  const calm = still()
  // The glow at 5 is a moment, played once as the bar passes the notch, not every time it is drawn.
  const [glowed, setGlowed] = useState(fill.stage !== 'start')
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (fill.stage === 'start' || glowed) return
    setGlowed(true)
    if (!calm) setFlash((n) => n + 1)
  }, [fill.stage, glowed, calm])
  const met = fill.stage === 'met' || fill.stage === 'long'
  return (
    <span data-practice-bar={fill.stage} data-practice-first={fill.first.toFixed(3)} data-practice-bonus={fill.bonus.toFixed(3)} data-practice-notch={fill.notch.toFixed(3)}
      role="meter" aria-label="Practice so far" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.floor(ms / 60_000)} aria-valuetext={stageWords(fill, target)}
      className="flex w-[58px] shrink-0 flex-col" style={{ opacity: paused ? 0.5 : 1 }}>
      <style>{CSS}</style>
      <span className="flex items-center gap-1.5">
        <span className="relative h-[6px] flex-1 rounded-[2px]"
          style={{ background: TRACK, boxShadow: met ? `0 0 7px 1px ${GLOW}` : undefined, transition: 'box-shadow 600ms var(--mf-ease, ease)' }}>
          <span data-practice-gold className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${fill.first * 100}%`, background: GOLD, animation: flash ? 'mf-practice-five 1.2s ease-out 1' : undefined }} key={flash} />
          {fill.bonus > 0 && <span data-practice-calm className="absolute inset-y-0 rounded-r-full" style={{ left: `${fill.first * 100}%`, width: `${fill.bonus * 100}%`, background: CALM }} />}
          {/* The notch at 5 minutes: drawn over the bar, a hair taller than it. */}
          {fill.notch < 1 && <span aria-hidden data-practice-notch-mark className="absolute -inset-y-[2px] w-[2px] -translate-x-1/2 rounded-full bg-foreground/60" style={{ left: `${fill.notch * 100}%` }} />}
        </span>
        {fill.stage !== 'start' && (
          <span data-practice-tick aria-hidden className="flex shrink-0" style={{ color: GOLD, animation: calm ? undefined : 'mf-practice-tick 260ms var(--mf-ease, ease-out) 1' }}>
            <Check strokeWidth={3} className="size-3" />
          </span>
        )}
      </span>
    </span>
  )
}

/**
 * The two safeguards, for a practice running: nobody at the Mac for a few
 * minutes pauses it (from when they left, so those minutes never count) and
 * it carries on once they are back; and at twice the target, one gentle ask
 * whether you are still going. Gives back whether that ask is up, and its answer.
 */
export function usePracticeGuard(focus: Focus, ms: number): { asking: boolean; idlePaused: boolean; keepGoing: () => void; five: boolean; carryOn: () => void } {
  const target = focus.practiceTarget ?? 0
  const [idlePaused, setIdlePaused] = useState(false)
  const latest = useRef({ focus, idlePaused })
  latest.current = { focus, idlePaused }
  useEffect(() => {
    if (!target) return
    const look = setInterval(() => void window.api.idleSeconds().then((seconds) => {
      const { focus: one, idlePaused: held } = latest.current
      if (!held && !one.pausedAt && seconds >= IDLE_PAUSE_SEC)
        void practices.idle(one.id, new Date(Date.now() - seconds * 1000).toISOString()).then((done) => done && setIdlePaused(true))
      // Back at the Mac: on again, the minutes away left out.
      else if (held && seconds < 5) void haligtree.resumeSession(one.id).then(() => (setIdlePaused(false), chime('on')))
    }), 5000)
    return () => clearInterval(look)
  }, [target])
  // Paused or resumed by hand meanwhile: that is yours, not the guard's.
  useEffect(() => void (!focus.pausedAt && setIdlePaused(false)), [focus.pausedAt])
  const asked = useRef<string | null>(null)
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!target || asked.current === focus.id || ms < target * 2 * 60_000) return
    asked.current = focus.id
    setAsking(true)
  }, [ms, target, focus.id])
  // At 5 minutes, the short start done: asked once whether to keep going. Left
  // alone it keeps running. Not asked again after a reload long past the 5.
  const fived = useRef<string | null>(null)
  const [five, setFive] = useState(false)
  useEffect(() => {
    if (!target || fived.current === focus.id || ms < START_MIN * 60_000) return
    fived.current = focus.id
    const key = `practice-five:${focus.id}`
    let seen = false
    try {
      seen = sessionStorage.getItem(key) === '1'
      sessionStorage.setItem(key, '1')
    } catch {
      // No storage: asked as if new.
    }
    if (!seen && ms < (START_MIN + 15) * 60_000) (setFive(true), chime('hint'))
  }, [ms, target, focus.id])
  return { asking, idlePaused, keepGoing: () => (setAsking(false), chime('tap')), five, carryOn: () => (setFive(false), chime('tap')) }
}

/**
 * As a practice ends: the minutes, said plainly (under 5 is still minutes,
 * nothing negative), the tick from 5 and the glow past the target, and one
 * optional question, "What stuck?". Answered, it is a gem on the practice's
 * tag, so it comes back in the feed and in the next session.
 */
export function WhatStuck({ id, ended, onDone }: { id: string; ended: Ended | null; onDone: () => void }): React.JSX.Element {
  const [words, setWords] = useState('')
  const [kept, setKept] = useState<string | null>(null)
  // Kept, ⌘Z takes it back as its Undo does, here or in the main window.
  useEffect(() => (kept === null ? undefined : offerUndo('Kept as a gem', () => practices.unstuck(kept, id), onDone)), [kept]) // eslint-disable-line react-hooks/exhaustive-deps
  const wait = usePatience(kept === null ? 60_000 : 4_000, onDone, !(words && kept === null))
  const skip = (): void => (chime('fold'), onDone())
  const keep = (): void => {
    if (!words.trim()) return skip()
    void practices.stuck(id, words.trim()).then((gem) => (gem ? (chime('logged'), setKept(gem)) : chime('nope')))
  }
  const stage = ended?.stage ?? 'partial'
  return (
    <span data-what-stuck={stage} {...(kept === null ? wait : {})} className="flex min-w-0 flex-1 items-center gap-2.5">
      <span data-practice-ended={stage} title={ended ? `${ended.minutes} min` : undefined}
        className="flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold tabular-nums"
        style={{ background: stage === 'partial' ? 'color-mix(in oklab, var(--foreground) 10%, transparent)' : GOLD, color: stage === 'partial' ? 'var(--foreground)' : 'var(--mf-gold-ink)', boxShadow: stage === 'met' ? `0 0 8px 1px ${GLOW}` : undefined }}>
        {stage !== 'partial' && <Check className="size-3" strokeWidth={3} />}
        {ended ? `${ended.minutes} min` : ''}
      </span>
      {kept === null ? (
        <>
          <label className="relative min-w-0 flex-1">
            {!words && <span aria-hidden className="pointer-events-none absolute inset-0 truncate text-muted-foreground"><Typed text="What stuck?" step={45} delay={250} /></span>}
            <input autoFocus value={words} aria-label="What stuck?" data-what-stuck-field onChange={(event) => setWords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) (event.preventDefault(), keep())
                if (event.key === 'Escape') (event.preventDefault(), skip())
              }}
              className="w-full bg-transparent font-medium outline-none" />
          </label>
          <Tip label="Skip"><button type="button" aria-label="Skip" onClick={skip} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button></Tip>
        </>
      ) : (
        <span data-stuck-kept {...wait} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate font-medium"><Typed text="Kept as a gem" step={35} delay={0} /></span>
          <button type="button" onClick={() => (chime('undo'), void takeBack())} className="flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Undo
          </button>
        </span>
      )}
    </span>
  )
}
