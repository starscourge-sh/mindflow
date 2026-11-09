import { Rolling } from "@/components/haligtree/ui"

/**
 * A count or a short label that rolls to its new value, up when it grows and
 * down when it shrinks; with motion off it simply changes. The app's one
 * `Rolling`, from its first change.
 */
export function Roll({ text, className }: { text: string | number; className?: string }): React.JSX.Element {
  return <Rolling text={text} className={className} eager />
}
