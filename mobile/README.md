# Deadzone — Android app (the offline moat)

The genuinely-offline surface: sign a payment with **no internet**, relay it phone-to-phone over a **Bluetooth LE mesh**, and have an online gateway settle it on Mantle. Android-only (iOS can't do BLE advertising — see the build plan §10).

Reuses NONET's proven BLE stack (`src/ble/bleUtils.ts` lifted verbatim).

## What it does
- **Wallet tab** — the device holds its own key (ethers, stored in AsyncStorage). "Get demo dUSD" hits the gateway faucet so the phone has something to send.
- **Send tab** — sign an EIP-3009 payment **offline** (gasless), fragment it, and advertise it over BLE. Any nearby Deadzone phone relays it. A phone **with internet** (gateway role) reassembles it and forwards it to the gateway to settle on Mantle — the agent validates → pre-commits to ERC-8004 → settles → attests.
- Header shows mesh role (OFFLINE / GATEWAY) + peer count; mesh activity + the Mantlescan settlement link stream live.

## Prerequisites
- A machine with the **Android SDK** (Android Studio) — this is a native build, not Expo Go.
- **2 Android phones** with Bluetooth (one acts as the offline sender, one as the online gateway). Min Android 6 (SDK 23).
- The **gateway running and reachable** from the phones (same Wi-Fi/LAN).

## Configure the gateway URL
The phones must reach your running gateway over the LAN. Set it in `app.json`:
```jsonc
"extra": { "gatewayUrl": "http://<YOUR-LAN-IP>:8787" }
```
Find your LAN IP (`ipconfig`/`ifconfig`/`ip addr`), and start the gateway bound to it:
```bash
cd ../gateway && npm start    # listens on 0.0.0.0:8787
```

## Build & run (on your machine)
```bash
cd mobile
npm install
# generate the native android project + run on a connected device/emulator:
npx expo run:android            # debug build to a plugged-in phone
# or a release APK you can sideload to both phones:
npx expo run:android --variant release
```
First run triggers `expo prebuild` (creates `android/`) and installs the BLE permissions from `plugins/withBlePermissions.js` (BLUETOOTH_SCAN/ADVERTISE/CONNECT + FINE_LOCATION). Grant Bluetooth + Location when prompted (Android requires Location for BLE scanning).

## The 2-phone demo
1. Install the app on **both** phones; on each, open the **Wallet** tab and tap **Get demo dUSD** (needs internet once).
2. On **Phone A**: turn **airplane mode ON**, then re-enable **Bluetooth only**. (Proves no internet.)
3. **Phone B**: leave it online (Wi-Fi) — it's the gateway.
4. On **Phone A** → **Send** tab: enter an amount + recipient → **Send with no signal**. Watch the fragments broadcast.
5. **Phone B** hears the fragments, reassembles the payment, forwards it to the gateway → it settles on **Mantle**. The settlement tx + Mantlescan link appear.

> Record this for the ≥2-min demo video — airplane mode visible on Phone A is the money shot.

## Notes / honest limits
- `react-native-ble-advertiser` is Android-only and the reason this is Android-first.
- BLE advertising payloads are tiny; large authorizations are fragmented (NONET's 6-byte-per-chunk protocol). Keep addresses/values reasonable for a snappy demo.
- The gateway holds the courier key and pays gas (this mirrors reality: edge phones relay; an online gateway settles). The phone's own key signs the payment — the settlement is genuinely phone-authorized.
