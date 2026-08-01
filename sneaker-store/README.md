# STUFFWEKNOW — storefront

A luxury-streetwear storefront for **StuffWeKnow** (stuffweknow.com): curated
technical footwear and objects. Dark, minimal, futuristic — a single
self-contained `index.html`, no build step, no dependencies, no backend.

## Design

Built to the StuffWeKnow brand guideline:

- **Palette** — near-black surfaces (`#050505 / #111111 / #191919`), off-white
  ink (`#F4F4F4 / #D8D8D8`), a single blue accent (`#3A7BFF`, used sparingly).
- **Type** — heavy grotesque display, tight tracking, generous whitespace.
- **Icon set** — bespoke 2px-stroke, rounded, Apple-minimal (cart, wishlist,
  account, search, menu, filter, sort, package, delivery, returns, verified,
  premium, arrow, chevron, instagram, tiktok…), all inline SVG.
- **Components** — premium product cards, badges (`NEW / LIMITED / DROP 01 /
  LOW STOCK / PREMIUM / SOLD OUT`), primary/secondary buttons, quantity
  selector, newsletter block, cart drawer, quick view, checkout.
- **Motion** — one entrance system (staggered reveal), scroll-reveal
  (IntersectionObserver, once), a chrome-sphere hero, cursor spotlight and
  magnetic CTA on desktop, slow marquees. Honors `prefers-reduced-motion`.

## Features

- Filterable catalog (Nike / Adidas / Objects) with live search.
- Quick view with size selection and out-of-stock states.
- Cart drawer with free-shipping progress, checkout flow, order confirmation.
- Wishlist, toasts, loading + empty states — all persisted in `localStorage`.
- Fully responsive (desktop → mobile). Product art is inline SVG; the featured
  adidas Trionda ball uses an embedded photo. No external assets.

Prices in USD.

## Run / deploy

Open `index.html` in a browser, or serve the folder statically. On the live
server it is mirrored from GitHub every minute (see `server-setup.sh`), so a
push to the branch updates stuffweknow.com within ~60s.

## Notes

Demo storefront — checkout shows a local confirmation, no real payment. Sneaker
model names are placeholders; the Trionda ball is a real adidas product.
StuffWeKnow is a boutique brand and is not affiliated with Nike or Adidas.
