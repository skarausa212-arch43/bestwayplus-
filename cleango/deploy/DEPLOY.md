# Deploying LUMI to your VPS (lumi24.pl)

Target: Ubuntu 22.04/24.04 VPS, served behind Caddy (automatic HTTPS) or nginx +
Let's Encrypt. The app is zero-dependency Node.js, so the install is tiny and fast.

## 0. Security first
Your root password was shared in a screenshot — **change it after deploying**
(`passwd`), or set up an SSH key and disable password login. Don't keep secrets
in chats or images.

## 1. Point the domain at the server
In the DNS panel for **bestwayplus.pl**, add an A-record:

```
Type: A    Host: lumi    Value: 130.17.12.118    TTL: 3600
```

(That makes `lumi.bestwayplus.pl` → your VPS.) DNS can take a few minutes to
a couple of hours to propagate.

## 2. Get the files onto the server
You have the `lumi-deploy.tar.gz` bundle (app + these scripts). Upload it to the
server — drag-and-drop in the Fornex **Console**, or from your own machine:

```bash
scp lumi-deploy.tar.gz root@130.17.12.118:/root/
```

Then on the server:

```bash
tar xzf lumi-deploy.tar.gz
cd lumi-deploy
sudo bash deploy.sh
```

This installs Node.js 20, runs LUMI as a `systemd` service (`lumi.service`) on
port 4000, and puts nginx in front on port 80. Check it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/   # → 200
systemctl status lumi
```

## 3. Turn on HTTPS (after DNS resolves)
```bash
sudo bash tls.sh
```
Issues a Let's Encrypt certificate and switches the site to HTTPS with
auto-redirect and auto-renewal. Done → **https://lumi.bestwayplus.pl**

## Auto-updates (hands-off)
`deploy.sh` also installs a `lumi-update.timer` that runs every 5 minutes: it
checks the branch on GitHub, and **only if it changed** pulls the new code,
syntax-checks it, and restarts the service. So after this one install you never
touch the server again — a push to `claude/cleango-app-yd4rzj` goes live within
~5 minutes automatically. The data dir is never overwritten. Watch updates:

```bash
journalctl -u lumi-update.service -f
systemctl list-timers lumi-update.timer
```

Turn it off any time: `sudo systemctl disable --now lumi-update.timer`.
Force an update now: `sudo systemctl start lumi-update.service`.

## Change the domain (or add one)
The served domain(s) live in **`deploy/instance.env`** as `LUMI_DOMAIN`
(comma-separated, no spaces). On a Caddy install this is fully hands-off:

1. Point the new domain's **A-record** at the server IP (same IP as the current
   domain is fine — the app serves several domains at once).
2. Edit `LUMI_DOMAIN` in `deploy/instance.env` (keep the old domain in the list
   during the switch so nothing breaks), and set `LUMI_APP_URL` to the primary,
   then push.

```
LUMI_DOMAIN=lumi24.pl,lumi.bestwayplus.pl
LUMI_APP_URL=https://lumi24.pl
```

> Run the server commands below as **root** (this image has no `sudo`).

**Caddy install:** `auto-update.sh` reconciles the Caddyfile to exactly
`LUMI_DOMAIN` on every tick and reloads Caddy; Caddy then issues a Let's Encrypt
certificate for each domain automatically once its DNS resolves here. It lands
within ~10 min (two ticks), or force it immediately:

```bash
bash /opt/lumi/deploy/auto-update.sh   # pull the new config + scripts
journalctl -u caddy -f                 # watch the cert get issued
```

**nginx install** (no Caddy on the box): after editing `LUMI_DOMAIN`, run once:

```bash
bash /opt/lumi/deploy/auto-update.sh   # pull the new config + scripts
bash /opt/lumi/deploy/tls.sh           # add the domain(s) to nginx + issue the cert
```

`tls.sh` adds every `LUMI_DOMAIN` host to the nginx vhost's `server_name`,
reloads nginx, and runs certbot for each domain that resolves to this server.

> If Google/Apple social sign-in is enabled, add the new domain's callback URLs
> in their consoles too (see *Social sign-in* below) — OAuth redirects use
> `LUMI_APP_URL`.

> Security note: with auto-update on, whoever can push to that branch controls
> the server. Keep the repo/branch protected.

## Move to a new server (keep all the data)
Migrating to a fresh VPS while carrying over the real accounts, bookings and
login sessions. You can do this before touching DNS — the app is reachable by
raw IP over HTTP right after `deploy.sh`, and you point the domain at the new
box afterwards.

1. **Stand up the new server.** Upload the bundle and run the installer exactly
   like a first install:
   ```bash
   tar xzf lumi-deploy.tar.gz && cd lumi-deploy
   sudo bash deploy.sh
   ```
   When it finishes it prints `Live now: http://<NEW_IP>` — open that to confirm
   the app runs (it'll be empty until you restore the data in step 3).

2. **Snapshot the data on the OLD server:**
   ```bash
   sudo bash deploy/backup-data.sh          # → /root/lumi-data-<stamp>.tgz
   ```
   This briefly pauses the service for a clean snapshot of the whole `data/` dir
   (JSON store + audit log + token secret). Add `--live` to skip the pause.

3. **Copy the snapshot to the NEW server and restore it:**
   ```bash
   # from your machine (or scp old→new directly if they can reach each other)
   scp root@OLD_IP:/root/lumi-data-<stamp>.tgz .
   scp lumi-data-<stamp>.tgz root@NEW_IP:/root/
   # then on the NEW server:
   sudo bash deploy/restore-data.sh /root/lumi-data-<stamp>.tgz
   ```
   The restore stops lumi, moves any existing data aside to `data.bak-<stamp>`
   (never deleted), loads the snapshot, fixes ownership and restarts. Because the
   token `secret` comes along, users who were logged in stay logged in.

4. **Cut the domain over** once the new box checks out: change the A-record
   `lumi → NEW_IP`, wait for it to resolve, then `sudo bash tls.sh` for HTTPS.
   Keep the old server running until DNS has propagated, then shut it down.

> Routine backups use the same tool: `sudo bash deploy/backup-data.sh --live`
> on a cron/timer, and keep the `.tgz` off-box.

## What is actually switched on? (one command)
Email, push and payments are all safe no-ops until their secrets exist, so a
running site says nothing about whether they work. Ask the server directly:

```bash
cd /opt/lumi && node ops/integrations-check.js
```

It reads the same env files the service does (`deploy/instance.local.env`, then
`deploy/instance.env`) and prints every integration as ON/OFF with the exact
variables that are missing. It never prints a secret — only whether a value is
present, and for Stripe whether the key is `sk_test_` or `sk_live_`. Exit code
is 1 while any launch-blocking integration is off, so it can gate a release
script. Run it after every change to the env files.

## Email (welcome on sign-up + order updates)
LUMI sends transactional email by **relaying through an SMTP server** — it does
**not** run its own mail server. Self-hosting an MTA on a fresh VPS almost always
lands in spam (port 25 is usually blocked, and IP reputation/SPF/DKIM/DMARC are
hard to get right). Use your domain mailbox or a provider (Brevo, Mailgun, Amazon
SES, Postmark — all have free/cheap tiers).

> **Secrets go in `deploy/instance.local.env`, not `instance.env`.** The tracked
> `instance.env` is overwritten by every code update, which would wipe an SMTP
> password. `instance.local.env` is git-ignored and never touched by updates, and
> its values override `instance.env`. Both `deploy.sh` and `auto-update.sh` merge
> the two into the systemd env. Run the commands below as **root** (no `sudo`).

1. **Get SMTP credentials** from your provider or domain host: host, port
   (587 STARTTLS or 465 TLS), username, password/API key.
2. **Create `deploy/instance.local.env` on the server** with the SMTP block and a
   From address on your own domain. For the GoDaddy **Microsoft 365** mailbox
   `support@lumi24.pl`:
   ```bash
   cat > /opt/lumi/deploy/instance.local.env <<'ENV'
   LUMI_SMTP_HOST=smtp.office365.com
   LUMI_SMTP_PORT=587
   LUMI_SMTP_USER=support@lumi24.pl
   LUMI_SMTP_PASS=THE_MAILBOX_PASSWORD
   LUMI_MAIL_FROM=support@lumi24.pl
   LUMI_MAIL_FROM_NAME=LUMI
   ENV
   chmod 600 /opt/lumi/deploy/instance.local.env
   bash /opt/lumi/deploy/auto-update.sh     # applies it as a systemd drop-in now
   ```
   (Brevo/Mailgun/SES/Postmark work the same way — just swap host/user/pass.)
   Until it’s set, email is a safe no-op — the app logs `[mail] disabled …`.
3. **Microsoft 365 only:** enable **Authenticated SMTP** for the mailbox
   (Microsoft 365 admin center → Users → `support@lumi24.pl` → Mail → *Manage email
   apps* → tick **Authenticated SMTP**). New tenants ship with it OFF, and sending
   fails with `535 5.7.139 … SmtpClientAuthentication is disabled` until you enable it.
   With M365 the `From` must equal `LUMI_SMTP_USER`. If the mailbox has MFA on, an
   ordinary password will not authenticate — create an app password for it.
4. **Test the connection** — this prints the config (never the password), sends a
   real message, and turns the SMTP status code into the fix for it:
   ```bash
   cd /opt/lumi && node mailer/send-test.js you@gmail.com   # настоящий ящик, не заполнитель
   ```
5. **Check the DNS side.** Credentials only get the message accepted; SPF, DKIM and
   DMARC decide whether the recipient ever sees it. This reads the live records and
   says whether they match the mail host the MX points at:
   ```bash
   cd /opt/lumi && node ops/mail-dns-check.js
   ```
   `lumi24.pl` currently publishes `v=spf1 include:secureserver.net -all` (GoDaddy)
   while the MX points at Microsoft 365. That is only correct if GoDaddy's own SPF
   chains through to Outlook — verify with `dig +short TXT secureserver.net` and look
   for `spf.protection.outlook.com`. If it is not in there, add `include:spf.protection.outlook.com`
   to the domain's SPF record, or the mail fails SPF and DMARC `p=quarantine` puts it
   straight into spam.
6. **End-to-end**: register a new account — the welcome email should arrive. Watch
   logs with `journalctl -u lumi -f` (`[mail] sent to …` vs an auth error).

> **The password never travels in clear text.** The client refuses to authenticate
> on a connection the server did not upgrade to TLS. If you see *«сервер не
> предложил STARTTLS»*, the port is wrong (use 587 or 465), not the password.

## Stripe: switching from test to live

The card flow is a safe no-op until `LUMI_STRIPE_SECRET_KEY` is set, and it stays
harmless on test keys — the buttons appear and nothing is ever charged. Going live
is four steps, and the last one is the important one.

1. **Finish verification** in the Stripe Dashboard (business details, bank account).
   Until `charges_enabled` is true no live payment goes through.
2. **Copy the live keys** — Developers → API keys, with the *Test mode* toggle OFF:
   `sk_live_…` and `pk_live_…`.
3. **Create the live webhook** — Developers → Webhooks → Add endpoint (again, test
   mode OFF), URL `https://lumi24.pl/api/payments/stripe/webhook`, subscribed to
   exactly:
   `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`.
   Copy its **Signing secret** (`whsec_…`) — a webhook created in test mode has a
   different secret and will not verify against live traffic.
4. **Put them on the server** and apply:
   ```bash
   cat >> /opt/lumi/deploy/instance.local.env <<'ENV'
   LUMI_STRIPE_SECRET_KEY=sk_live_...
   LUMI_STRIPE_PUBLISHABLE_KEY=pk_live_...
   LUMI_STRIPE_WEBHOOK_SECRET=whsec_...
   ENV
   bash /opt/lumi/deploy/auto-update.sh
   ```

**Then verify, before a customer does it for you:**

```bash
cd /opt/lumi && node ops/stripe-check.js
```

It asks Stripe with the key the service actually uses and reports: live vs test,
whether the account may charge and pay out, the settlement currency, whether a
webhook points at this domain, whether it is subscribed to all three events, and
whether the signing secret matches its mode. It creates nothing and charges
nothing. A missing webhook event is the nastiest failure here — the customer pays,
Stripe is happy, and the order stays "unpaid" in LUMI forever.

Finish with one real order on a real card (a cheap one), then refund it from the
admin panel — that exercises charge, webhook and refund end to end.

## Social sign-in (Google + Apple)
The login screen shows **“Continue with Google”** and **“Continue with Apple”**
buttons **only when the matching provider is configured** — otherwise they’re
hidden and email/password still works. All config is via env in
`deploy/instance.env` (secrets stay on the server, never committed). The buttons
redirect to the provider and back to `${LUMI_APP_URL}/api/auth/<provider>/callback`,
so **HTTPS must be live** and `LUMI_APP_URL` set to your real domain.

**Google** ([console.cloud.google.com](https://console.cloud.google.com) →
APIs & Services → Credentials → *OAuth client ID* → *Web application*):
- Authorized redirect URI: `https://lumi.bestwayplus.pl/api/auth/google/callback`
- Copy the client ID + secret into:
  ```
  GOOGLE_CLIENT_ID=...apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=...            # secret — server only, never commit
  ```

**Apple** ([developer.apple.com](https://developer.apple.com) → Certificates,
Identifiers & Profiles — needs a paid Apple Developer account):
- Create a **Services ID** (this is your `APPLE_CLIENT_ID`, e.g.
  `pl.bestwayplus.lumi.web`); enable *Sign in with Apple* and add the domain +
  return URL `https://lumi.bestwayplus.pl/api/auth/apple/callback`.
- Create a **Sign in with Apple key**, download the `.p8`, note its **Key ID**;
  your **Team ID** is in the top-right of the portal.
  ```
  APPLE_CLIENT_ID=pl.bestwayplus.lumi.web
  APPLE_TEAM_ID=XXXXXXXXXX
  APPLE_KEY_ID=YYYYYYYYYY
  APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...contents of the .p8...\n-----END PRIVATE KEY-----"
  ```
  (Newlines may be written as `\n`.) LUMI mints Apple’s short-lived client secret
  itself from this key — nothing else to rotate.

New social accounts are created as customers, verified, with the name/email from
the provider (a welcome email is sent). If the email already exists, the provider
is linked to that account. Test: open the site, click a provider button, approve,
and you should land signed in.

## Notes
- **Demo accounts are OFF by default** in production (`LUMI_SEED=off` in the
  service unit), so there are no public `cleango123` logins. Remove that line
  from `/etc/systemd/system/lumi.service` and `systemctl restart lumi` if you
  want the demo data back to try it, then register your own real accounts.
- **Data** lives in `/opt/lumi/data` (JSON store) and survives re-deploys.
- **Update later**: replace the bundle and re-run `sudo bash deploy.sh` — the
  data dir is preserved.
- **Logs**: `journalctl -u lumi -f`
- The MVP store is JSON files (fine for a pilot). For real scale, graduate to
  the Postgres/Supabase schema in `db/` (see the app README).
