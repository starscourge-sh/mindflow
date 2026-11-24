# Haligtree's site

A static product page for Haligtree. Plain HTML, one stylesheet, one small
script for the bar at the top. It is not deployed or published anywhere.

## Open it

From the repo root:

    python3 -m http.server -d site 8742 --bind 127.0.0.1

Then open http://127.0.0.1:8742

## What is in it

- `index.html`: the product page. One idea at a time, with the app itself in the frame.
- `product.css`, `product.js`: that page only.
- `for/` and `features/`: shorter pages from earlier, still on `style.css`.
- `img/`: screenshots of the app. The product page crops the sandbox strip off the top.
- `fonts/`: Fraunces, under the SIL Open Font License (`fonts/OFL.txt`), used by the shorter pages.

Every claim on the product page is something the app does today. The lines come
from What Haligtree can do.
