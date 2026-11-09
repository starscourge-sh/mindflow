/**
 * What the window was doing, for main/freeze-catch.ts to write down when the
 * window stops answering and its script cannot be paused (the stall was in
 * layout, painting or a long native call, not in script): the last long
 * frames the browser saw (each over 100ms, with the scripts that ran in it,
 * where they came from, and how long of it was forced layout), and the last
 * pages opened, with when. Read once the window answers again, as
 * `window.__freezeNotes()`. Cheap enough to keep in every build: an observer
 * of frames over 100ms and one look at the page a second.
 */
type Frame = { at: number; ms: number; blocking: number; layout: number; scripts: string[] }
const frames: Frame[] = []
const pages: { at: number; page: string }[] = []

{
  try {
    new PerformanceObserver((list) => {
      for (const one of list.getEntries() as (PerformanceEntry & { blockingDuration?: number; renderStart?: number; styleAndLayoutStart?: number; scripts?: { invoker: string; sourceURL: string; sourceFunctionName: string; sourceCharPosition: number; duration: number; forcedStyleAndLayoutDuration: number }[] })[]) {
        if (one.duration < 100) continue
        const where = (url: string): string => url.replace(/^.*?\/src\//, 'src/').replace(/\?.*$/, '')
        frames.push({
          at: Math.round(one.startTime),
          ms: Math.round(one.duration),
          blocking: Math.round(one.blockingDuration ?? 0),
          // Style and layout and paint at the frame's end, after its scripts.
          layout: Math.round(one.styleAndLayoutStart && one.renderStart ? one.startTime + one.duration - one.styleAndLayoutStart : 0),
          scripts: (one.scripts ?? []).slice(0, 6).map((s) => `${Math.round(s.duration)}ms ${s.invoker} ${s.sourceFunctionName || '(anonymous)'} ${where(s.sourceURL)}:${s.sourceCharPosition}${s.forcedStyleAndLayoutDuration ? `, forced layout ${Math.round(s.forcedStyleAndLayoutDuration)}ms` : ''}`)
        })
        if (frames.length > 30) frames.shift()
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    // An older browser: no long frames to tell.
  }
  // The page on show, read once a second (home.tsx marks it `data-page`): a page watcher on every change cost more.
  let last = ''
  setInterval(() => {
    const page = document.querySelector('[data-pane-front] [data-page], [data-page]')?.getAttribute('data-page') ?? ''
    if (page === last) return
    last = page
    pages.push({ at: Math.round(performance.now()), page })
    if (pages.length > 20) pages.shift()
  }, 1000)
}

;(window as { __freezeNotes?: () => string }).__freezeNotes = () => {
  const now = Math.round(performance.now())
  const ago = (at: number): string => `${((now - at) / 1000).toFixed(1)}s ago`
  return [
    `long frames (over 100ms), newest last:`,
    ...frames.map((f) => `  ${ago(f.at)}: ${f.ms}ms (blocking ${f.blocking}ms, style/layout/paint at its end ${f.layout}ms)${f.scripts.length ? '\n' + f.scripts.map((s) => `    ${s}`).join('\n') : ''}`),
    `pages opened, newest last:`,
    ...pages.map((p) => `  ${ago(p.at)}: ${p.page}`),
    `flight on: ${document.documentElement.dataset.hero ?? 'none'}`
  ].join('\n')
}

export {}
