const appJson = require('./app.json');

const config = appJson.expo;
const googlePlugin = '@react-native-google-signin/google-signin';
const notificationsPlugin = 'expo-notifications';
const localTestBuild = process.env.EXPERT_AI_LOCALTEST_BUILD === 'true';
const productionBuild = process.env.EAS_BUILD_PROFILE === 'production';
// EAS exposes the target while resolving build-time dynamic config. Local Expo
// introspection has no target, so keep the strict production default for iOS.
const isIosBuild = process.env.EAS_BUILD_PLATFORM !== 'android';
const publicBundleId = config.ios?.bundleIdentifier ?? 'com.ssvasia.expertai';
const localTestBundleId = 'com.local.expertai';
const iosGoogleClientId = (localTestBuild
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_LOCALTEST_CLIENT_ID
  : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)?.trim();
const iosBundleId = localTestBuild ? localTestBundleId : publicBundleId;
// Expo Notifications defaults aps-environment to development, which cannot
// request production APNs tokens for App Store builds.
const apsEnvironment = process.env.EXPERT_AI_APS_ENVIRONMENT?.trim()
  || (productionBuild ? 'production' : 'development');
if (apsEnvironment !== 'development' && apsEnvironment !== 'production') {
  throw new Error('EXPERT_AI_APS_ENVIRONMENT must be either development or production.');
}
if (productionBuild && localTestBuild) {
  throw new Error('EXPERT_AI_LOCALTEST_BUILD cannot be enabled for an EAS production build.');
}
if (productionBuild && isIosBuild && apsEnvironment !== 'production') {
  throw new Error('EAS production builds must use the production APNs entitlement.');
}
if (productionBuild && isIosBuild && !iosGoogleClientId) {
  throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is required for production iOS builds so the configured Google sign-in option is present.');
}
const plugins = (config.plugins ?? []).filter((plugin) =>
  (Array.isArray(plugin) ? plugin[0] : plugin) !== googlePlugin,
).map((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  if (name !== notificationsPlugin) return plugin;
  const options = Array.isArray(plugin) && plugin[1] && typeof plugin[1] === 'object'
    ? plugin[1]
    : {};
  return [notificationsPlugin, { ...options, mode: apsEnvironment }];
});

// The native plugin requires the reversed iOS OAuth client ID as its URL
// scheme. Omit the plugin while the iOS client is unconfigured; the app then
// builds with Google sign-in clearly disabled instead of failing prebuild.
if (iosGoogleClientId) {
  const clientIdPrefix = iosGoogleClientId.match(/^([A-Za-z0-9-]+)\.apps\.googleusercontent\.com$/)?.[1];
  if (!clientIdPrefix) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be a Google iOS OAuth client ID.');
  }
  plugins.push([googlePlugin, { iosUrlScheme: `com.googleusercontent.apps.${clientIdPrefix}` }]);
}

module.exports = {
  ...config,
  ios: {
    ...config.ios,
    bundleIdentifier: iosBundleId,
    deploymentTarget: config.ios?.deploymentTarget ?? '16.0',
    entitlements: {
      ...config.ios?.entitlements,
      'aps-environment': apsEnvironment,
    },
  },
  extra: {
    ...config.extra,
    googleIosClientId: iosGoogleClientId || undefined,
  },
  plugins,
};
