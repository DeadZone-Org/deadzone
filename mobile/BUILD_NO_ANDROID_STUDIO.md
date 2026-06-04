# Build the Deadzone APK with NO Android Studio (cloud build)

You don't need Android Studio or the Android SDK. Expo's **EAS Build** compiles the
APK in the cloud; you just download and install it on your phones.

## What you DO need
- A free **Expo account** → sign up at https://expo.dev
- **Node.js** on any computer (to run the CLI that kicks off the cloud build)
- **2 Android phones** with Bluetooth (no way around hardware for a BLE demo)
- The **gateway reachable** from the phones (see "Gateway URL" below)

## One-time setup
```bash
npm install -g eas-cli
eas login                       # log in to your Expo account
cd mobile
```

## Point the app at a reachable gateway (IMPORTANT — do before building)
A standalone APK bakes the gateway URL in at build time. Edit `mobile/app.json`:
```jsonc
"extra": { "gatewayUrl": "https://<your-gateway>" }
```
Pick ONE:
- **Same Wi-Fi (simplest):** run `cd gateway && npm start`, find your laptop's LAN IP
  (`ipconfig` / `ifconfig` / `ip addr`), use `http://<LAN-IP>:8787`. Phones must be on the same Wi-Fi.
- **Public (works anywhere):** expose the gateway with a tunnel —
  `npx ngrok http 8787` — and use the `https://…ngrok…` URL. Best for filming the demo on cellular/airplane mix.

## Build the APK (cloud)
```bash
eas build -p android --profile preview
```
- First run: answer "yes" to create the EAS project; it auto-generates a keystore.
- Wait ~10–20 min. You get a **download URL** for the `.apk`.
- Open that URL on each phone (or download + transfer) and install (allow "install from unknown sources").

## Run the 2-phone offline demo
1. Install the APK on **both** phones.
2. On each: open **Wallet** → **Get demo dUSD** (needs internet once).
3. **Phone A:** airplane mode ON, Bluetooth back ON (proves no internet).
4. **Phone B:** keep it online (it's the gateway).
5. **Phone A → Send:** amount + recipient → **Send with no signal**.
6. **Phone B** hears it, settles on Mantle; the Mantlescan tx link appears. 🎉

> Film Phase A's airplane-mode toggle — that's the money shot for the ≥2-min video.

## Alternatives
- **Local build (if you later install the Android SDK):** `npx expo run:android`.
- **Don't have 2 phones?** The **web dApp** already demonstrates the full flow (offline-sign →
  agent → real Mantle settlement) and is enough for the public-URL + Best UI/UX + Community Voting
  requirements. The Android app is the *bonus* that makes "offline" literally true on camera.
