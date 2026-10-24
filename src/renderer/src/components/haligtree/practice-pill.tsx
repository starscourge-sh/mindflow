import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

import { chime } from '@/lib/sound'
import { still } from '@/lib/motion'
import { Check, X } from '@/components/ui/icons'
import { IDLE_PAUSE_SEC, START_MIN, fillOf, type Fill } from '../../../../main/practice-rules'
import { answerOffer, offerSaid, practices, startPractice, suggestSaid, timeSaid, type Ended, type Offer } from '@/lib/practices'
import { haligtree, type Focus } from '@/lib/haligtree'
import { usePatience } from '@/lib/patience'
import { Kbd, Tip, Typed } from './ui'

/**
 * A practice in the bubble: the pill's bar, the guard against a timer left
 * running, the offer, and "What stuck?" as it ends (main/practices.ts).
 * At 5 minutes it asks once whether to keep going (never stops you); at the
 * target the bar says it.
 */

/** Bright gold for the first 5 minutes, the part that counts most. */
const GOLD = 'oklch(0.8 0.15 82)'
/** Past the 5: a calmer fill of the same gold, a bonus, not a must. */
const CALM = 'color-mix(in oklab, oklch(0.8 0.15 82) 42%, transparent)'
const TRACK = 'color-mix(in oklab, var(--foreground) 12%, transparent)'
const CSS = `@keyframes mf-practice-five { 0% { box-shadow: 0 0 0 0 oklch(0.8 0.15 82 / 0) } 30% { box-shadow: 0 0 0 3px oklch(0.8 0.15 82 / 0.45), 0 0 10px 2px oklch(0.8 0.15 82 / 0.5) } 100% { box-shadow: 0 0 0 0 oklch(0.8 0.15 82 / 0) } }
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
export function PracticeBar({ ms, target, wide = false, paused = false }: { ms: number; target: number; wide?: boolean; paused?: boolean }): React.JSX.Element {
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
      className={`flex shrink-0 flex-col ${wide ? 'w-full gap-1' : 'w-[58px]'}`} style={{ opacity: paused ? 0.5 : 1 }}>
      <style>{CSS}</style>
      <span className="flex items-center gap-1.5">
        <span className={`relative flex-1 rounded-full ${wide ? 'h-2' : 'h-[6px]'}`}
          style={{ background: TRACK, boxShadow: met ? `0 0 ${wide ? 10 : 7}px 1px oklch(0.8 0.15 82 / 0.55)` : undefined, transition: 'box-shadow 600ms var(--mf-ease, ease)' }}>
          <span data-practice-gold className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill.first * 100}%`, background: GOLD, animation: flash ? 'mf-practice-five 1.2s ease-out 1' : undefined }} key={flash} />
          {fill.bonus > 0 && <span data-practice-calm className="absolute inset-y-0 rounded-r-full" style={{ left: `${fill.first * 100}%`, width: `${fill.bonus * 100}%`, background: CALM }} />}
          {/* The notch at 5 minutes: drawn over the bar, a hair taller than it. */}
          {fill.notch < 1 && <span aria-hidden data-practice-notch-mark className="absolute -inset-y-[2px] w-[2px] -translate-x-1/2 rounded-full bg-foreground/60" style={{ left: `${fill.notch * 100}%` }} />}
        </span>
        {fill.stage !== 'start' && (
          <span data-practice-tick aria-hidden className="flex shrink-0" style={{ color: GOLD, animation: calm ? undefined : 'mf-practice-tick 260ms var(--mf-ease, ease-out) 1' }}>
            <Check strokeWidth={3} className={wide ? 'size-3.5' : 'size-3'} />
          </span>
        )}
      </span>
      {wide && (
        <span aria-hidden className="relative h-4 text-[11px] font-medium text-muted-foreground tabular-nums">
          <span className="absolute -translate-x-1/2" style={{ left: `${fill.notch * 100}%` }}>{START_MIN}m</span>
          <span className="absolute right-0">{target}m</span>
        </span>
      )}
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
 * The offer itself: one gentle card, "9:00 Design patterns, 5 minutes?", with
 * ↵ start, N not tonight, S in 30 min. Its keys work whenever it holds the
 * keys (the box focuses it when it opens empty); a click does the same.
 * Declined again and again at one time, it says when else seems to suit you.
 */
export function PracticeOfferCard({ offer, onDone, autoFocus = false, compact = false, onType }: { offer: Offer; onDone?: () => void; autoFocus?: boolean; compact?: boolean; /** Any other key: the keys go back to where you write, and the key with them. */ onType?: () => void }): React.JSX.Element {
  const card = useRef<HTMLDivElement>(null)
  // A beat after the box draws, so it lands after the note's own focus.
  useEffect(() => {
    if (!autoFocus) return
    const later = setTimeout(() => card.current?.focus({ preventScroll: true }), 120)
    return () => clearTimeout(later)
  }, [autoFocus, offer.id])
  const start = (): void => void startPractice(offer.id).then(() => onDone?.())
  const skip = (): void => (answerOffer(offer, 'skip'), onDone?.())
  const later = (): void => (answerOffer(offer, 'later'), onDone?.())
  const move = (to: string | null): void => void practices.move(offer.id, to).then(() => chime(to ? 'move' : 'tap'))
  const key = 'flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold transition-[background-color,filter] focus-visible:outline-2 focus-visible:outline-[var(--tt-brand-color-400)]'
  return (
    <div ref={card} tabIndex={-1} role="group" aria-label={offerSaid(offer)} data-practice-offer={offer.id}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return
        const k = event.key.toLowerCase()
        if (k === 'enter') (event.preventDefault(), event.stopPropagation(), start())
        else if (k === 'n') (event.preventDefault(), event.stopPropagation(), skip())
        else if (k === 's') (event.preventDefault(), event.stopPropagation(), later())
        else if (onType && (event.key.length === 1 || event.key === 'Escape' || event.key === 'Tab' || event.key === 'ArrowDown')) onType()
      }}
      className={`outline-none ${compact ? '' : 'rounded-[14px] border bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] px-3 py-2.5 focus:border-[color-mix(in_oklab,var(--tt-brand-color-400)_60%,var(--border))]'}`}>
      <p data-practice-offer-line className="text-[14px] leading-5 font-semibold text-foreground">
        <span className="tabular-nums">{offer.later ? 'Again:' : timeSaid(offer.at)}</span> {offer.name}, {START_MIN} minutes?
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-0.5">
        <button type="button" data-practice-start onClick={start} className={`${key} bg-[var(--tt-brand-color-400)] mf-on-accent hover:brightness-110`}>
          <Kbd className="border-transparent bg-white/20 text-current">↵</Kbd> Start
        </button>
        <button type="button" data-practice-skip onClick={skip} className={`${key} text-foreground hover:bg-accent`}>
          <Kbd>N</Kbd> Not tonight
        </button>
        <button type="button" data-practice-later onClick={later} className={`${key} text-foreground hover:bg-accent`}>
          <Kbd>S</Kbd> In 30 min
        </button>
      </div>
      {offer.suggest && (
        <div data-practice-suggest className="mt-2.5 border-t pt-2">
          <p className="text-[13px] leading-[18px] text-foreground">{suggestSaid(offer.suggest)} Move it?</p>
          <div className="mt-1.5 flex gap-1">
            <button type="button" data-practice-move onClick={() => move(offer.suggest!.to)} className={`${key} border text-foreground hover:bg-accent`}>Move to {timeSaid(offer.suggest.to)}</button>
            <button type="button" data-practice-keep-time onClick={() => move(null)} className={`${key} text-muted-foreground hover:bg-accent hover:text-foreground`}>Keep {timeSaid(offer.suggest.from)}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The offer in the bubble, with nothing running: a band dropped in under the
 * menu bar (or the notch) the way the pill drops in. A click on it takes the
 * keys, so ↵, N and S work there too. Never starts anything by itself.
 */
export function PracticeOfferBand({ offer, notch }: { offer: Offer; notch: number }): React.JSX.Element {
  const calm = useRef(still()).current
  const box = useRef<HTMLDivElement>(null)
  // The window as tall as the band, and no taller: nothing around it stops taking clicks.
  useEffect(() => {
    if (!box.current) return
    const fit = (): void => void window.api.focusSize(Math.ceil((box.current?.offsetHeight ?? 0) + (notch ? 0 : 14) + 24))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(box.current)
    return () => watch.disconnect()
  }, [notch])
  useEffect(() => chime('hint'), [offer.id])
  return (
    <div className="mf-floating flex h-screen items-start justify-center overflow-hidden" style={{ paddingTop: notch ? notch : 14 }}>
      <motion.div ref={box} data-practice-band
        initial={calm ? { opacity: 0 } : { y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={calm ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 30 }}
        onMouseDown={(event) => (event.currentTarget.querySelector<HTMLElement>('[data-practice-offer]')?.focus({ preventScroll: true }), undefined)}
        style={{ backgroundImage: 'linear-gradient(var(--popover), var(--popover)), linear-gradient(var(--background), var(--background))', backgroundColor: 'Canvas', filter: 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.14)) drop-shadow(0 3px 3px rgb(0 0 0 / 0.08))' }}
        className={`w-[322px] border px-3 py-2.5 font-[system-ui,-apple-system,sans-serif] text-foreground ${notch ? 'rounded-t-none rounded-b-[18px] border-t-0' : 'rounded-[22px]'}`}>
        <PracticeOfferCard offer={offer} compact />
      </motion.div>
    </div>
  )
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
        style={{ background: stage === 'partial' ? 'color-mix(in oklab, var(--foreground) 10%, transparent)' : GOLD, color: stage === 'partial' ? 'var(--foreground)' : 'oklch(0.25 0.05 80)', boxShadow: stage === 'met' ? '0 0 8px 1px oklch(0.8 0.15 82 / 0.6)' : undefined }}>
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
          <button type="button" onClick={() => void practices.unstuck(kept, id).then(() => (chime('undo'), onDone()))} className="flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Undo
          </button>
        </span>
      )}
    </span>
  )
}
