# Deploying LUMI to your VPS (lumi.bestwayplus.pl)

Target: Ubuntu 22.04/24.04 VPS, served behind nginx with Let's Encrypt HTTPS.
The app is zero-dependency Node.js, so the install is tiny and fast.

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

> Security note: with auto-update on, whoever can push to that branch controls
> the server. Keep the repo/branch protected.

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
