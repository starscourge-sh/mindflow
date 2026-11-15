import { cn } from "@/lib/cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 shrink-0 items-center whitespace-nowrap [overflow-wrap:normal] justify-center gap-1 rounded-xs bg-muted px-1 font-sans text-[0.625rem] font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-foreground/10 in-data-[slot=tooltip-content]:text-popover-foreground [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }

/**
 * A tip's words as the app writes them, for every tip (Tip and a plain
 * title alike): "Words  Keys" puts the keys in a keycap at the end, never in
 * the sentence, and a second line ("\n") is the fine print, quieter, under
 * them. What follows the two spaces is taken as keys only when it is short.
 */
function TipText({ text }: { text: string }) {
  const [head, ...more] = text.split("\n")
  const at = head.lastIndexOf("  ")
  const keys = at < 0 ? "" : head.slice(at + 2).trim()
  const keyed = !!keys && keys.length <= 12
  const words = keyed ? head.slice(0, at).trim() : head
  return (
    <span data-tip-text className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        {words && <span className="min-w-0">{words}</span>}
        {keyed && <>{"  "}<Kbd data-tip-key className="bg-foreground/10 text-popover-foreground">{keys}</Kbd></>}
      </span>
      {more.length > 0 && <span data-tip-more className="text-muted-foreground">{more.join(" ")}</span>}
    </span>
  )
}

export { TipText }
