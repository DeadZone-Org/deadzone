const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * react-native-ble-advertiser (v0.0.17, 2019) hardcodes compileSdkVersion 28 /
 * buildToolsVersion 28.0.3 in its own android/build.gradle, which is too old to
 * compile its Java 9+ source ("set compileSdkVersion to 30 or above"). We can't edit
 * node_modules in a cloud build, so force that one subproject up to a modern SDK from
 * the root build.gradle. Targeted by name so Expo modules (on SDK 36) are untouched.
 */
const MARKER = '// deadzone:fix-ble-advertiser-sdk';
const SNIPPET = `
${MARKER}
subprojects { subproject ->
    if (subproject.name == 'react-native-ble-advertiser') {
        subproject.afterEvaluate {
            if (subproject.hasProperty('android')) {
                subproject.android {
                    compileSdkVersion 36
                    buildToolsVersion '36.0.0'
                }
            }
        }
    }
}
`;

module.exports = function withFixBleAdvertiserSdk(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
