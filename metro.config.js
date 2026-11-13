const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const WEB_STUBS = {
  'react-native-pager-view': path.resolve(__dirname, 'web-stubs/react-native-pager-view.js'),
  // The native Play in-app-update package has no web entrypoint. The app
  // already guards all update calls by platform; this stub keeps the shared
  // chat route bundleable without changing Android behavior.
  'sp-react-native-in-app-updates': path.resolve(__dirname, 'web-stubs/sp-react-native-in-app-updates.js'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, ...args) => {
  if (WEB_STUBS[moduleName] && context.platform !== 'ios' && context.platform !== 'android') {
    return { type: 'sourceFile', filePath: WEB_STUBS[moduleName] };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, ...args);
  }
  return context.resolveRequest(context, moduleName, ...args);
};

module.exports = config;
