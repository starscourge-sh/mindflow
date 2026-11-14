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
  const ask = (): void => void (idle = requestIdleCallback(go, options))
  function go(): void {
    idle = 0
    const welcome = document.querySelector('.mf-welcome')
    if (!welcome?.parentNode) return work()
    // Asked again once it has gone: the welcome taken off the page.
    watch = new MutationObserver(() => {
      if (welcome.isConnected) return
      watch?.disconnect()
      watch = undefined
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
