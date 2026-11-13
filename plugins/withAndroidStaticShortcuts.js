const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const shortcuts = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut android:shortcutId="quick_chat" android:enabled="true" android:icon="@drawable/ic_shortcut_chat" android:shortcutShortLabel="@string/shortcut_quick_chat" android:shortcutLongLabel="@string/shortcut_quick_chat_long">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="com.ssvasia.expertai" android:targetClass="com.ssvasia.expertai.MainActivity" android:data="expertai:///simple-chat" />
  </shortcut>
  <shortcut android:shortcutId="agent_chat" android:enabled="true" android:icon="@drawable/ic_shortcut_agent" android:shortcutShortLabel="@string/shortcut_agent_chat" android:shortcutLongLabel="@string/shortcut_agent_chat_long">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="com.ssvasia.expertai" android:targetClass="com.ssvasia.expertai.MainActivity" android:data="expertai:///agent-chat" />
  </shortcut>
  <shortcut android:shortcutId="your_computers" android:enabled="true" android:icon="@drawable/ic_shortcut_computers" android:shortcutShortLabel="@string/shortcut_computers" android:shortcutLongLabel="@string/shortcut_computers_long">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="com.ssvasia.expertai" android:targetClass="com.ssvasia.expertai.MainActivity" android:data="expertai:///servers" />
  </shortcut>
  <shortcut android:shortcutId="account" android:enabled="true" android:icon="@drawable/ic_shortcut_account" android:shortcutShortLabel="@string/shortcut_account" android:shortcutLongLabel="@string/shortcut_account_long">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="com.ssvasia.expertai" android:targetClass="com.ssvasia.expertai.MainActivity" android:data="expertai:///profile" />
  </shortcut>
</shortcuts>`;

const strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="shortcut_quick_chat">Quick chat</string>
  <string name="shortcut_quick_chat_long">Start a new Expert AI chat</string>
  <string name="shortcut_agent_chat">Agent Chat</string>
  <string name="shortcut_agent_chat_long">Chat with your paired computer</string>
  <string name="shortcut_computers">Your computers</string>
  <string name="shortcut_computers_long">Manage paired computers</string>
  <string name="shortcut_account">Account</string>
  <string name="shortcut_account_long">Open your Expert AI account</string>
</resources>`;

const drawables = {
  'ic_shortcut_chat.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FF6F42C1" android:pathData="M4,4h16a2,2 0,0 1,2 2v10a2,2 0,0 1,-2 2h-9l-6,4v-4h-1a2,2 0,0 1,-2 -2v-10a2,2 0,0 1,2 -2z"/></vector>`,
  'ic_shortcut_agent.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FF6F42C1" android:pathData="M3,4h18a2,2 0,0 1,2 2v11a2,2 0,0 1,-2 2h-7v2h4v2h-12v-2h4v-2h-7a2,2 0,0 1,-2 -2v-11a2,2 0,0 1,2 -2zM4,6v11h16v-11z"/></vector>`,
  'ic_shortcut_computers.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FF6F42C1" android:pathData="M4,3h16a2,2 0,0 1,2 2v10a2,2 0,0 1,-2 2h-6v2h4v2h-12v-2h4v-2h-6a2,2 0,0 1,-2 -2v-10a2,2 0,0 1,2 -2zM4,5v10h16v-10z"/></vector>`,
  'ic_shortcut_account.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FF6F42C1" android:pathData="M12,12a4,4 0,1 0,0 -8a4,4 0,0 0,0 8zM4,21c0,-4.4 3.6,-7 8,-7s8,2.6 8,7z"/></vector>`
};

module.exports = function withAndroidStaticShortcuts(config) {
  config = withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application?.[0]?.activity?.find(
      (activity) => activity.$?.['android:name'] === '.MainActivity',
    );
    if (!mainActivity) throw new Error('MainActivity missing; cannot add Android app shortcuts.');
    mainActivity['meta-data'] = mainActivity['meta-data'] ?? [];
    const name = 'android.app.shortcuts';
    const existing = mainActivity['meta-data'].find((item) => item.$?.['android:name'] === name);
    if (existing) existing.$['android:resource'] = '@xml/expert_ai_shortcuts';
    else mainActivity['meta-data'].push({ $: { 'android:name': name, 'android:resource': '@xml/expert_ai_shortcuts' } });
    return config;
  });

  return withDangerousMod(config, ['android', async (config) => {
    const res = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
    fs.mkdirSync(path.join(res, 'values'), { recursive: true });
    fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
    fs.writeFileSync(path.join(res, 'xml', 'expert_ai_shortcuts.xml'), shortcuts);
    fs.writeFileSync(path.join(res, 'values', 'expert_ai_shortcut_strings.xml'), strings);
    for (const [file, source] of Object.entries(drawables)) fs.writeFileSync(path.join(res, 'drawable', file), source);
    return config;
  }]);
};
