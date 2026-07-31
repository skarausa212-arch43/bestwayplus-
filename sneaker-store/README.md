# SOLEHAUS — sneakers & accessories store

A storefront for authentic **Nike** and **Adidas** sneakers and accessories.
A single self-contained `index.html` — no build step, no dependencies, no backend.

## What's inside

- **Catalog storefront** — 13 products (sneakers + accessories) with brand filters and live search.
- **Quick view** — modal with description and size selection (EU 39–46 for sneakers, custom sizes for gear), out-of-stock states.
- **Cart** — slide-out drawer: quantities, remove, free-shipping progress bar, total.
- **Checkout** — form with validation and an order confirmation screen (demo, no real charge).
- **Favorites**, toast notifications, dark/light theme — all persisted in `localStorage`.
- **Responsive** — from desktop (4 columns) down to mobile (2 columns).
- Product art is inline SVG, recolored per model (no external images).
- Featured accessory: **adidas FIFA World Cup 26™ Trionda Training Ball** (JD8032).

Prices are shown in USD.

## Run

Just open the file in a browser:

```bash
xdg-open sneaker-store/index.html    # or double-click
```

## Deploy to a server (nginx)

```bash
# on the server
mkdir -p /var/www/solehaus
cp index.html /var/www/solehaus/
```

Minimal nginx config:

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/solehaus;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
```

It's static — serve it with `python3 -m http.server`, nginx, or any CDN.

## Notes

- This is a demo storefront. Payments and order fulfillment are not wired up — the
  checkout form shows a local confirmation only. A production store needs a backend
  (order intake, payments, inventory).
- SOLEHAUS is a fictional multi-brand retailer and is not an official Nike or Adidas
  retailer. Sneaker model names are placeholders; the Trionda ball is a real adidas product.
