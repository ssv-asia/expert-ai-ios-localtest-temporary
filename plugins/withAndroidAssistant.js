const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

// Registers Expert AI as an Android VoiceInteractionService. The service opens
// a small, foreground-only handoff panel and launches the existing RN chat;
// it deliberately does not request screen context, accessibility control, or
// background recording permissions.
module.exports = function withAndroidAssistant(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return config;
    application.service = application.service ?? [];
    const serviceMetaData = [{ $: {
      'android:name': 'android.voice_interaction_service',
      'android:resource': '@xml/voice_interaction_service',
    }}];
    if (!application.service.some((item) => item.$?.['android:name'] === '.assistant.ExpertAiVoiceInteractionService')) {
      application.service.push({
        $: {
          'android:name': '.assistant.ExpertAiVoiceInteractionService',
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.voice.VoiceInteractionService' } }] }],
        'meta-data': serviceMetaData,
      });
    }
    if (!application.service.some((item) => item.$?.['android:name'] === '.assistant.ExpertAiVoiceInteractionSessionService')) {
      application.service.push({
        $: {
          'android:name': '.assistant.ExpertAiVoiceInteractionSessionService',
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION_SERVICE',
          'android:exported': 'false',
        },
      });
    }
    return config;
  });

  return withDangerousMod(config, ['android', async (config) => {
    const root = config.modRequest.platformProjectRoot;
    const source = path.join(config.modRequest.projectRoot, 'plugins', 'android-assistant');
    const javaDir = path.join(root, 'app', 'src', 'main', 'java', 'com', 'ssvasia', 'expertai', 'assistant');
    const xmlDir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(xmlDir, { recursive: true });
    for (const file of ['ExpertAiVoiceInteractionService.java', 'ExpertAiVoiceInteractionSession.java', 'ExpertAiVoiceInteractionSessionService.java']) {
      fs.copyFileSync(path.join(source, file), path.join(javaDir, file));
    }
    fs.copyFileSync(path.join(source, 'voice_interaction_service.xml'), path.join(xmlDir, 'voice_interaction_service.xml'));
    return config;
  }]);
};
