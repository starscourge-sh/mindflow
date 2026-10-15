import { useEffect, useRef } from "react"
import { SlotText } from "slot-text/react"
import { still } from "@/lib/motion"

/**
 * A count or a short label that rolls to its new value, up when it grows and
 * down when it shrinks; with motion off it simply changes.
 */
export function Roll({ text, className }: { text: string | number; className?: string }): React.JSX.Element {
  const last = useRef(text)
  const up = typeof text === "number" && typeof last.current === "number" ? text >= last.current : true
  useEffect(() => void (last.current = text), [text])
  const off = still()
  return <SlotText text={String(text)} className={className} options={{ direction: up ? "up" : "down", duration: off ? 0 : 260, stagger: off ? 0 : 35, exitOffset: off ? 0 : 40, easing: "cubic-bezier(0.16, 1, 0.3, 1)", bounce: 0.2 }} />
}
