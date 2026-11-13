const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

const BILLING_DEPENDENCY = 'implementation("com.android.billingclient:billing:9.1.0")';

module.exports = function withAndroidBilling(config) {
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('com.android.billingclient:billing:9.1.0')) {
      config.modResults.contents = config.modResults.contents.replace(
        'dependencies {',
        `dependencies {\n    ${BILLING_DEPENDENCY}`,
      );
    }
    return config;
  });

  return withDangerousMod(config, ['android', async (config) => {
    const root = config.modRequest.platformProjectRoot;
    const source = path.join(config.modRequest.projectRoot, 'plugins', 'android-billing');
    const javaDir = path.join(root, 'app', 'src', 'main', 'java', 'com', 'ssvasia', 'expertai', 'billing');
    fs.mkdirSync(javaDir, { recursive: true });
    for (const file of ['PlayBillingModule.java', 'PlayBillingPackage.java']) {
      fs.copyFileSync(path.join(source, file), path.join(javaDir, file));
    }

    const mainApplication = path.join(root, 'app', 'src', 'main', 'java', 'com', 'ssvasia', 'expertai', 'MainApplication.kt');
    if (fs.existsSync(mainApplication)) {
      const contents = fs.readFileSync(mainApplication, 'utf8');
      if (!contents.includes('PlayBillingPackage()')) {
        fs.writeFileSync(mainApplication, contents.replace('add(ImeInsetsPackage())', 'add(ImeInsetsPackage())\n              add(com.ssvasia.expertai.billing.PlayBillingPackage())'));
      }
    }
    return config;
  }]);
};
