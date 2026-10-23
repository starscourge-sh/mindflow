import { createCn } from 'cn/config'
import type { CnFunction } from 'cn'

// The app's own type roles (main.css) read to the merger as colours, since it
// cannot tell `text-control` from `text-muted-foreground`; without this it
// drops one of the two whenever both are given. Naming them as sizes keeps both.
export const cn: CnFunction = createCn({
  extend: { classGroups: { 'font-size': [{ text: ['meta', 'control', 'body', 'heading', 'title', 'key'] }] } },
})
