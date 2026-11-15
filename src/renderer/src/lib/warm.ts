/**
 * Work done ahead, out of sight, so that a first use is as quick as every one after it (an editor built once, the
 * paper's shaders compiled): run in an idle moment, and never while the welcome is on screen. One step of it can hold
 * the page for a tenth of a second, which in the welcome's arrival is a frame dropped where everyone looks (13 Nov: the
 * paper's shaders, compiled half way through the arrival). Asked while the welcome is up, it waits for the welcome
 * to have gone, then for an idle moment. Returns a way to call it off.
 */
export function warmLater(work: () => void, options?: IdleRequestOptions): () => void {
  let idle = 0
  let watch: MutationObserver | undefined
  // Its time is counted from the first ask (and again from the welcome's going), never from each ask after a moment
  // too short: asked again on every sliver of a long scroll, it would never reach its time.
  let from = performance.now()
  const ask = (): void => {
    const timeout = options?.timeout === undefined ? undefined : Math.max(1, options.timeout - (performance.now() - from))
    idle = requestIdleCallback(go, timeout === undefined ? undefined : { timeout })
  }
  function go(deadline: IdleDeadline): void {
    idle = 0
    // Only in a stretch with nothing being drawn (40ms or more of it; the browser gives 50 at most), or once its time
    // is up: between the frames of a scroll there are slivers of 1 to 4ms, and the paper's shaders compiled in one of
    // them held the page 85ms, a hitch in the first fling of a session (15 Nov 2026, from Chromium traces of it).
    if (!deadline.didTimeout && deadline.timeRemaining() < 40) return ask()
    const welcome = document.querySelector('.mf-welcome')
    if (!welcome?.parentNode) return work()
    // Asked again once it has gone: the welcome taken off the page.
    watch = new MutationObserver(() => {
      if (welcome.isConnected) return
      watch?.disconnect()
      watch = undefined
      from = performance.now()
      ask()
    })
    watch.observe(welcome.parentNode, { childList: true })
  }
  ask()
  return () => {
    if (idle) cancelIdleCallback(idle)
    watch?.disconnect()
  }
}
