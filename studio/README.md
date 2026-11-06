# BestWay Studio

Landing page for $199 small-business websites, with a site-brief form and Stripe checkout.

- `index.html` — the site (GSAP and Lenis are vendored in `vendor/`, no CDN needed)
- `server.js` — serves the site, creates Stripe Checkout sessions, stores orders. Node 18+, no npm install.
- `orders/` — one JSON file per order (brief + payment status). Not committed.

## What the customer pays

Every website includes a **free .com domain** (registered in the customer's name) and the **first month of hosting free**.

At checkout (one Stripe subscription with a 30-day trial):

| Item | Price | When |
|---|---|---|
| Custom website | $199 one-time | today |
| Online store upgrade (optional): up to 20 products + online payments | +$200 one-time | today |
| Add-ons (optional) | $29–$79 one-time each | today |
| .com domain, first year | free | — |
| Hosting + SSL + domain renewal | $12/month or $119/year | after the free 30 days |

The free period is `FREE_HOSTING_DAYS` in `server.js`.

If the customer picks **their own hosting**, checkout is a one-time payment (no subscription) and the brief says to install the site on their host.

Prices live in `PRICES` in `server.js`. The browser only sends the customer's choices, and the server works out the amount. If you change a price, update both `server.js` and the `PRICES` block in `index.html` (that one is only for display).

## Run

```bash
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
PUBLIC_URL=https://your-domain.com \
PORT=8787 \
node studio/server.js
```

Optional: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` send you a message with the brief when an order is paid.

`GET /api/health` shows whether payments and the webhook are configured.

## Stripe setup

1. Dashboard → Developers → API keys → copy the secret key (`sk_test_...` first, `sk_live_...` when ready).
2. Developers → Webhooks → Add endpoint `https://your-domain.com/api/stripe-webhook`, event `checkout.session.completed`. Copy the signing secret (`whsec_...`).
3. Test with card `4242 4242 4242 4242`, any future date, any CVC.

After payment the customer lands on `/?paid=<order id>#order` and sees a confirmation. The webhook marks `orders/<id>.json` as `"status": "paid"`.

## Without the server

If `/api/checkout` is not reachable (for example the page is opened as a plain file), the form shows a message, no charge is made, and the customer gets a link to email the brief instead.
