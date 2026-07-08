# Publishing OPEN CITY to the Google Play Store

The game is a PWA, so it ships to Play as a **Trusted Web Activity (TWA)** — a
thin Android app that runs the live site at
`https://faizankhan17623.github.io/Gta-Clone/` in fullscreen Chrome, with no
browser UI. Updates to the game are just `git push`; no new APK needed unless
the app shell itself changes.

Everything in this repo is already prepared:

| File | Purpose |
| --- | --- |
| `manifest.json` | PWA manifest (fullscreen, landscape, maskable icon) — TWA reads this |
| `sw.js` | offline service worker (required for installability) |
| `privacy.html` | privacy policy page — Play requires a public URL for this |
| `.well-known/assetlinks.json` | proves the app and site belong together (removes the URL bar) — needs your key fingerprint, see step 4 |
| `twa-manifest.json` | ready-made Bubblewrap config |

## One-time setup

You need a **Google Play Developer account** ($25 one-time): https://play.google.com/console/signup

## Option A — PWABuilder (easiest, no SDK installs)

1. Go to https://www.pwabuilder.com and enter
   `https://faizankhan17623.github.io/Gta-Clone/`
2. Click **Package for Stores → Android**. Set:
   - Package ID: `io.github.faizankhan17623.opencity`
   - App name: `OPEN CITY`, display mode **Fullscreen**, orientation **Landscape**
   - Let PWABuilder generate the signing key (it gives you a `.keystore` + a
     `signing-key-info` file — **back these up forever**; losing them means you
     can never update the app).
3. Download the ZIP. It contains an `.aab` (upload this to Play) and
   `assetlinks.json` with your real SHA-256 fingerprint.
4. Copy the fingerprint into this repo's `.well-known/assetlinks.json`
   (replace `REPLACE_WITH_YOUR_SIGNING_KEY_SHA256_FINGERPRINT`), commit, push,
   and wait for GitHub Pages to deploy. Verify it's live at:
   `https://faizankhan17623.github.io/Gta-Clone/.well-known/assetlinks.json`
   > Without this, the app still works but shows a browser URL bar on top.

## Option B — Bubblewrap CLI (local, uses `twa-manifest.json`)

```bash
npm i -g @bubblewrap/cli
cd D:/practice/game
bubblewrap build        # first run offers to install JDK + Android SDK
```
- It creates `android.keystore` (alias `opencity`) — **back it up**.
- Print the fingerprint for assetlinks.json:
  ```bash
  bubblewrap fingerprint list
  ```
- Put the SHA-256 into `.well-known/assetlinks.json`, commit, push.
- Output: `app-release-bundle.aab`.

## Play Console steps

1. **Create app** → name `OPEN CITY`, App (Game), Free.
2. **Release → Testing → Internal testing** → upload the `.aab`, add your own
   email as a tester, install it on your phone and play a round. Then promote
   to **Production**.
3. **Store listing**:
   - Short + full description (mention: open-world web-swinging, driving,
     boats, arena, races — works offline).
   - Screenshots: at least 2 phone screenshots (use the in-game 📸 button —
     landscape 16:9 works well), plus a **feature graphic 1024×500**.
   - App icon 512×512: use `icon-512.png` from this repo.
4. **App content** (left sidebar — all required):
   - **Privacy policy URL**: `https://faizankhan17623.github.io/Gta-Clone/privacy.html`
   - **Data safety**: declare **"No data collected, no data shared"** (true —
     saves are local-only, no analytics, no ad SDKs in this release).
   - **Content rating questionnaire**: category Game → answer honestly
     (cartoon/fantasy violence yes, realistic gore no, gambling-themed
     mini-game (casino) yes-simulated, no real-money gambling). Expect a
     Teen / PEGI 12-ish rating.
   - **Ads declaration**: "No ads" (the ad screens are simulated by the game
     itself; flip this to Yes only if you later wire real AdMob IDs via
     `setAdConfig()` in `js/ads.js` — that also changes Data safety).
   - Target audience: 13+.
5. Submit for review. First review typically takes a few days.

## Updating the game later

Game content updates: just push to GitHub — every installed copy loads the new
version on next launch. Only bump `appVersionCode`/`appVersionName` and upload
a new `.aab` if you change the app shell (icon, name, orientation, package).

## Checklist before submitting

- [ ] `.well-known/assetlinks.json` has the real fingerprint and is live
- [ ] `privacy.html` is live
- [ ] Keystore + passwords backed up somewhere safe (NOT committed to git)
- [ ] Tested the `.aab` via Internal testing on a real phone
