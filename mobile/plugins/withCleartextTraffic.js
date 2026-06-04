const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Allow cleartext (HTTP) traffic so the app can reach a gateway on the local network
 * at http://<LAN-IP>:8787 during the demo. Without this, Android 9+ blocks the request.
 */
module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};
