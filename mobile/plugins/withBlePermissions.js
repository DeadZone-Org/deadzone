const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * BLE permissions for the Deadzone mesh.
 * Crucially: BLUETOOTH_SCAN is declared with usesPermissionFlags="neverForLocation".
 * Without that flag, Android 12+ BLE scanning silently returns NOTHING unless the
 * phone's Location Services (GPS) is turned on — the classic "0 peers in a release
 * build" bug. The flag tells Android we never derive location from BLE, so scanning
 * works regardless of the GPS toggle.
 */
module.exports = function withBlePermissions(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const list = (manifest.manifest["uses-permission"] =
      manifest.manifest["uses-permission"] || []);

    const byName = (n) => list.find((p) => p.$ && p.$["android:name"] === n);
    const ensure = (name, extra) => {
      let entry = byName(name);
      if (!entry) {
        entry = { $: { "android:name": name } };
        list.push(entry);
      }
      if (extra) Object.assign(entry.$, extra);
    };

    ensure("android.permission.BLUETOOTH"); // legacy (<= API 30)
    ensure("android.permission.BLUETOOTH_ADMIN");
    ensure("android.permission.BLUETOOTH_ADVERTISE");
    ensure("android.permission.BLUETOOTH_CONNECT");
    // scanning without claiming location:
    ensure("android.permission.BLUETOOTH_SCAN", {
      "android:usesPermissionFlags": "neverForLocation",
    });
    // still needed for BLE scan on Android <= 11:
    ensure("android.permission.ACCESS_FINE_LOCATION", {
      "android:maxSdkVersion": "30",
    });
    ensure("android.permission.ACCESS_NETWORK_STATE");

    return config;
  });
};
