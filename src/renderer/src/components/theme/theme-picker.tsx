import type { Theme } from "@/lib/theme"

/** Three of a theme's colours, overlapping. The stylesheet paints them. */
export const Swatch = ({ theme }: { theme: Theme }): React.JSX.Element => (
  <span className={`mf-swatch mf-swatch-${theme}`}>
    <i />
    <i />
    <i />
  </span>
)
