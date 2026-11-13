const { withAndroidManifest } = require('@expo/config-plugins');

// The chat composer owns keyboard avoidance in JS. Keep Android from panning
// or resizing the entire activity; only the bottom composer dock is translated
// by the measured IME height in simple-chat.tsx.
module.exports = function withAndroidKeyboard(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const mainActivity = application?.activity?.find((activity) => activity.$?.['android:name'] === '.MainActivity');
    if (mainActivity) mainActivity.$['android:windowSoftInputMode'] = 'adjustNothing';
    return config;
  });
};
