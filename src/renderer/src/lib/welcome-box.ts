import { useEffect } from 'react'

/**
 * The box, while the welcome waits on your first capture: its empty line
 * types out three real-sounding examples in turn instead of "Type / for
 * commands…", the third showing that a half-thought is welcome too. Only
 * while the welcome is open; the stylesheet does the rest (main.css).
 */
export const EXAMPLES = ['Buy oat milk', 'Ask Sam about the Lisbon flat', '"The obstacle is the way": check who said that']

export function useWelcomePlaceholder(): void {
  useEffect(() => {
    const root = document.documentElement
    let timers: ReturnType<typeof setTimeout>[] = []
    const stop = (): void => {
      timers.forEach(clearTimeout)
      timers = []
      delete root.dataset.welcomePh
      root.style.removeProperty('--mf-welcome-ph')
    }
    const show = (text: string): void => root.style.setProperty('--mf-welcome-ph', JSON.stringify(text))
    const run = (n: number): void => {
      const line = EXAMPLES[n % EXAMPLES.length]
      const quiet = root.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches
      // The first is there the moment the box opens, so the line is never blank; the rest type in.
      if (quiet || n === 0) show(line)
      else for (let i = 1; i <= line.length; i++) timers.push(setTimeout(() => show(line.slice(0, i)), i * 38))
      timers.push(setTimeout(() => run(n + 1), (quiet || n === 0 ? 0 : line.length * 38) + 3000))
    }
    const start = (): void =>
      void (window.api.vigil('onboarding:welcoming') as Promise<boolean>).then((on) => {
        stop()
        if (!on) return
        root.dataset.welcomePh = ''
        run(0)
      }).catch(() => undefined)
    start()
    const offShown = window.api.onShown(start)
    const offHiding = window.api.onHiding(stop)
    return () => {
      stop()
      offShown()
      offHiding()
    }
  }, [])
}
