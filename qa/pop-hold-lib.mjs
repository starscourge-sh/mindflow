// The entrance of a floating surface, stopped as it starts and stepped by hand: a picture takes longer than an entrance
// lasts, so its own animation is paused the moment it begins and moved to each moment asked for. Shared by
// qa/pop-entrance.mjs and qa/pop-pages.mjs.

/** Stops the entrance of whatever matches `sel` on the page `on` as it starts (asked before the pointer opens it). */
export const holdEntrance = (on, sel) => on.evaluate((sel) => { window.__heldN = null; const t0 = performance.now(); const tick = () => { const el = document.querySelector(sel); const list = el?.getAnimations() ?? []; if (list.length) { list.forEach((one) => one.pause()); window.__heldN = list.length } else if (el && performance.now() - t0 > 600) window.__heldN = 0; else if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else window.__heldN = -1 }; requestAnimationFrame(tick) }, sel)

/** The entrance stepped by hand to each of `steps` (ms): how whole the surface is at each, and a picture at `pathFor(t)` when one is asked for. */
export const stepEntrance = async (on, sel, steps, pathFor = null) => {
  await on.waitForFunction(() => window.__heldN !== null, null, { timeout: 6000 }).catch(() => {})
  const seen = []
  for (const t of steps) {
    const at = await on.evaluate(([sel, t]) => { const el = document.querySelector(sel); if (!el) return null; const list = el.getAnimations(); list.forEach((one) => { one.currentTime = t }); const style = getComputedStyle(el); return { n: list.length, opacity: Number(style.opacity), clip: style.clipPath.slice(0, 44), scale: Number(new DOMMatrixReadOnly(style.transform).a.toFixed(3)), fades: list.some((one) => one.effect?.getKeyframes?.().some((key) => 'opacity' in key)) } }, [sel, t])
    seen.push(at)
    if (pathFor) await on.screenshot({ path: pathFor(t) })
  }
  await on.evaluate((sel) => document.querySelector(sel)?.getAnimations().forEach((one) => one.finish()), sel)
  return seen
}
