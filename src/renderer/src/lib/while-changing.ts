/**
 * Runs `step` once a frame, but only while the page can be changing: from any change to it (a node, an attribute, a
 * style, text), a window resize or scroll, a CSS transition or animation starting, or the Mac's look changing, until two
 * frames pass with `step` saying nothing moved and `busy` saying nothing still animates. At rest no frame is asked for: a
 * loop measuring every frame kept each sticky drawing 60 frames a second for nothing (qa/goal-cards-many.mjs).
 * `step` returns true when what it measured changed. A step must not set an attribute to the value it already has: that
 * is a change to the page too, and would keep waking it.
 */
export function whileChanging(step: () => boolean | void, busy: () => boolean = () => false): void {
  let running = false
  let still = 0
  const frame = (): void => {
    if (step()) still = 0
    else still++
    if (still < 2 || busy()) requestAnimationFrame(frame)
    else running = false
  }
  const wake = (): void => {
    still = 0
    if (running) return
    running = true
    requestAnimationFrame(frame)
  }
  new MutationObserver(wake).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
  for (const kind of ['resize', 'scroll', 'transitionrun', 'animationstart']) addEventListener(kind, wake, true)
  for (const query of ['(prefers-reduced-transparency: reduce)', '(prefers-color-scheme: dark)']) matchMedia(query).addEventListener('change', wake)
  wake()
}

/** Whether a running animation or transition is on one of `els` or round one (so can move it or fade it). */
export const animatingRound = (els: (Element | null)[]): boolean =>
  document.getAnimations().some((one) => {
    const target = one.playState === 'running' && one.effect instanceof KeyframeEffect ? one.effect.target : null
    return !!target && els.some((el) => !!el && target.contains(el))
  })
