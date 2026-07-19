# LUMI — native apps (Android + iOS)

A thin **Capacitor** shell that bundles the LUMI web app so the **design and all
logic load instantly from inside the app**, while **data, auth and bookings come
live from `https://lumi24.pl`**. Adds **native push notifications** (one Firebase
project serves both platforms — Android directly, iOS via FCM's APNs bridge).

```
public/            ← the web app (unchanged; already native-ready via window.LUMI_API_BASE)
mobile/            ← this Capacitor project
  capacitor.config.json
  native-bootstrap.js  ← injected into the bundled app: push register + deep links
  scripts/sync-web.js  ← copies public/ → www/ and wires the backend URL (cross-platform Node)
```

## What you need (external — like the email/OCR keys)

- A **Mac with Xcode** (required to build/submit iOS) and **Android Studio**.
- An **Apple Developer** account ($99/yr) for iOS push + App Store.
- A **Google Play** developer account ($25 once) for Android.
- A **Firebase** project (free) for push — gives Android FCM and, with an APNs
  key uploaded, iOS push too.

The app code and server are done; these accounts and the final build/submit are
yours to do (I can't run Xcode/Android Studio or hold your signing keys).

## 1. Server: turn push on

Push is a safe no-op until Firebase is configured. In Firebase → Project
settings → **Service accounts** → *Generate new private key* (JSON). Put its
three fields in the server-only secrets file (never in git):

```bash
cat >> /opt/lumi/deploy/instance.local.env <<'ENV'
LUMI_FCM_PROJECT_ID=your-firebase-project-id
LUMI_FCM_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
LUMI_FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
ENV
bash /opt/lumi/deploy/auto-update.sh      # applies it, restarts the service
```

(The private key is one line with `\n` for newlines — the server unescapes it.)

## 2. Build the shell

From `mobile/` on your Mac:

```bash
npm install
npm run add:android        # creates android/
npm run add:ios            # creates ios/  (Mac only)
npm run build              # sync-web.sh → www/, then `cap sync`
```

`sync-web.js` copies `public/` into `www/` and injects
`window.LUMI_API_BASE="https://lumi24.pl"` + `native-bootstrap.js`, so the bundled
app calls the live API and registers for push. Re-run `npm run build` after any
web change.

### App icon + splash

The brand assets are ready in `assets/` (LUMI house icon + splash, light & dark).
After `add:android` / `add:ios`, generate every platform size:

```bash
npm run assets      # @capacitor/assets → all icon/splash sizes into ios/ + android/
```

To restyle, replace `assets/icon.png` (1024²), `assets/icon-foreground.png` +
`assets/icon-background.png` (adaptive), `assets/splash.png` / `assets/splash-dark.png`
(2732²) and re-run `npm run assets`.

## 3. Wire push per platform

Drop your Firebase config file(s) into **`mobile/`** — every `npm run build` (and
`add:*`) copies them into the native projects automatically (`scripts/place-firebase.js`):

- **Android:** save the downloaded `google-services.json` as
  `mobile/google-services.json`. Capacitor's Android template applies the
  google-services Gradle plugin automatically when that file is present. (If a
  build ever complains it can't find the plugin, add
  `classpath 'com.google.gms:google-services:4.4.2'` to `android/build.gradle`
  buildscript dependencies.)
- **iOS:** create an **APNs Auth Key (.p8)** in the Apple Developer portal and
  upload it to Firebase → Cloud Messaging → Apple app config. Save
  `GoogleService-Info.plist` as `mobile/GoogleService-Info.plist`. In Xcode enable
  **Push Notifications** and **Background Modes → Remote notifications**.

These two files are git-ignored — they stay on your machine.

## 4. Run / publish

```bash
npm run open:android       # → Android Studio: Run on device, or build a signed AAB
npm run open:ios           # → Xcode: Run on device, or Archive → App Store Connect
```

Publish the signed AAB to **Google Play** and the archive to **App Store
Connect**. First review typically takes a few days.

## How it behaves

- Cold start shows the bundled UI immediately (no white webview wait); only data
  requests hit the network.
- A push tap opens the app and deep-links (e.g. `lumi://booking/<id>`) via the
  SPA hash router.
- Device tokens are registered per signed-in user (`POST /api/devices/register`)
  and pruned automatically when FCM reports them dead.
- No secrets ship in the app; auth stays a Bearer token in the web app as today.

## Notes

- `appId` is `pl.lumi24.app` — change it in `capacitor.config.json` before first
  build if you want a different bundle id (must match Firebase + the stores).
- **Location permissions** (GPS pin for bookings, nearest-first dispatch for
  cleaners) are added to `AndroidManifest.xml` automatically by
  `scripts/patch-manifest.js` (runs in `add:android`; re-run any time with
  `npm run fix-manifest`). iOS: add `NSLocationWhenInUseUsageDescription` to
  `ios/App/App/Info.plist` when you build the iOS shell.
- `www/`, `ios/`, `android/`, `node_modules/` are git-ignored — they are
  generated. Commit only the config, bootstrap and scripts.
