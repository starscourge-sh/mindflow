import { useCallback } from "react";
import { useAnimate } from "motion/react";

/** Every duration and delay in a transition (and in each value's own), times `by`. */
function quicker(transition: unknown, by: number): unknown {
  if (!transition || typeof transition !== "object" || Array.isArray(transition)) return transition;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(transition)) {
    out[key] = typeof value === "number" && (key === "duration" || key === "delay" || key === "repeatDelay")
      ? value * by
      : typeof value === "object" ? quicker(value, by) : value;
  }
  return out;
}

/**
 * `useAnimate` for an icon's hover move, played `by` times its written
 * length: icons are pointed at tens of times a day, so each move is one beat
 * of about a quarter second in all, however many steps it takes (STANDARDS:
 * hover motion is drastically reduced). The drawing's own shape is kept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBeat<T extends Element = any>(by: number): ReturnType<typeof useAnimate<T>> {
  const [scope, animate] = useAnimate<T>();
  const quick = useCallback(
    (...args: unknown[]) => {
      // Written with no length, a move takes Motion's own 0.3s; that is scaled too.
      const options = (args[2] ?? {}) as Record<string, unknown>;
      const timed = "duration" in options || "type" in options ? options : { duration: 0.3, ...options };
      return (animate as (...all: unknown[]) => unknown)(args[0], args[1], quicker(timed, by));
    },
    [animate, by],
  ) as unknown as typeof animate;
  return [scope, quick];
}
