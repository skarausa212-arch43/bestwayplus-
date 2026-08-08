# STUFFWEKNOW — Android app (TWA)

A **Trusted Web Activity**: a thin Android shell that renders `https://stuffweknow.com`
full-screen in Chrome. Everything loads from the live site — new site deploys ship
instantly to the app with no rebuild. Push notifications work through the site's
service worker (Web Push), so no Firebase project is required.

## What you need on your build machine (once)

- **Node.js 18+** and **Java JDK 17** (`sudo apt install openjdk-17-jdk`)
- **Bubblewrap CLI**: `npm i -g @bubblewrap/cli`
  (First run downloads the Android SDK + build tools automatically.)

## Build the APK / AAB

From this `android/` folder:

```bash
# 1. Initialise from the site's web manifest (uses the twa-manifest.json here)
bubblewrap init --manifest https://stuffweknow.com/manifest.webmanifest

# When prompted, accept the defaults. It will CREATE A SIGNING KEY (android.keystore)
# and ask you to set a keystore password + key password — SAVE THESE, you need them
# for every future update and to publish on Google Play.

# 2. Build
bubblewrap build
```

This produces:
- `app-release-signed.apk` — install directly on a phone for testing
  (`adb install app-release-signed.apk`, or copy to the phone and open it).
- `app-release-bundle.aab` — upload this to **Google Play Console**.

## CRITICAL final step — link the app to the domain (removes the URL bar)

The app must prove it owns `stuffweknow.com`, otherwise Chrome shows a URL bar at the top.

1. Print your signing fingerprint:
   ```bash
   keytool -list -v -keystore android.keystore -alias stuffweknow | grep "SHA256:"
   ```
   Copy the `SHA256: AB:CD:EF:…` value (the long colon-separated hex).

2. Open **stuffweknow.com/admin → Settings → App fingerprints (assetlinks.json)**,
   paste the fingerprint, Save. (Or set env `TWA_FINGERPRINTS=AB:CD:…` on the server.)

3. Verify it's live:
   ```bash
   curl https://stuffweknow.com/.well-known/assetlinks.json
   ```
   You should see your package + fingerprint. Reinstall the app — the URL bar is gone.

> If you publish on Google Play, also add **Play App Signing's** SHA-256
> (Play Console → Setup → App integrity) as a SECOND line in the same admin field —
> Google re-signs the app, so its fingerprint differs from your local keystore.

## Push notifications

Already wired: when a user signs in, the app asks for notification permission and
subscribes. They then get pushes for new offers, accepted offers, messages, and
sales. Nothing to configure here — it flows through the site.

## Updating the app later

- **Content / features**: just deploy the site. The app always loads the latest.
- **App shell** (icon, name, new Android version): bump `appVersionCode` in
  `twa-manifest.json`, run `bubblewrap update && bubblewrap build`, upload the new
  `.aab`. Use the **same keystore** as the first build.
