const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const QUICK_ACTIONS = [
  {
    type: 'com.ssvasia.expertai.quick-chat',
    title: 'Quick chat',
    subtitle: 'Start a new Expert AI chat',
    symbol: 'bubble.left.and.bubble.right',
    route: 'simple-chat',
  },
  {
    type: 'com.ssvasia.expertai.agent-chat',
    title: 'Agent Chat',
    subtitle: 'Chat with your paired computer',
    symbol: 'desktopcomputer',
    route: 'agent-chat',
  },
  {
    type: 'com.ssvasia.expertai.computers',
    title: 'Your computers',
    subtitle: 'Manage paired computers',
    symbol: 'laptopcomputer',
    route: 'servers',
  },
  {
    type: 'com.ssvasia.expertai.account',
    title: 'Account',
    subtitle: 'Open your Expert AI account',
    symbol: 'person.crop.circle',
    route: 'profile',
  },
];

function withIosQuickActions(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationShortcutItems = QUICK_ACTIONS.map((item) => ({
      UIApplicationShortcutItemType: item.type,
      UIApplicationShortcutItemTitle: item.title,
      UIApplicationShortcutItemSubtitle: item.subtitle,
      UIApplicationShortcutItemIconSymbolName: item.symbol,
      UIApplicationShortcutItemUserInfo: { route: item.route },
    }));
    return config;
  });

  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('iOS Quick Actions currently require the Swift AppDelegate.');
    }

    const source = config.modResults.contents;
    const launchOptionsCall = `    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)`;
    const launchOptionsReplacement = `    var reactLaunchOptions = launchOptions ?? [:]
    if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
       let route = shortcutItem.userInfo?["route"] as? String,
       let shortcutURL = URL(string: "expertai:///\\(route)") {
      reactLaunchOptions[.url] = shortcutURL
    }

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: reactLaunchOptions)`;

    const quickActionHandler = `  public override func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    if routedQuickActionDuringLaunch {
      routedQuickActionDuringLaunch = false
      super.application(application, performActionFor: shortcutItem) { _ in
        completionHandler(true)
      }
      return
    }

    guard let route = shortcutItem.userInfo?["route"] as? String,
          let shortcutURL = URL(string: "expertai:///\\(route)") else {
      super.application(application, performActionFor: shortcutItem, completionHandler: completionHandler)
      return
    }

    let handledByReact = RCTLinkingManager.application(application, open: shortcutURL, options: [:])
    super.application(application, performActionFor: shortcutItem) { handledByExpo in
      completionHandler(handledByReact || handledByExpo)
    }
  }

`;

    let updated = source;
    if (!updated.includes('reactLaunchOptions[.url] = shortcutURL')) {
      if (!updated.includes(launchOptionsCall)) {
        throw new Error('Could not find the Expo React Native launch call to route cold-start Quick Actions.');
      }
      updated = updated.replace(launchOptionsCall, launchOptionsReplacement);
    }

    if (!updated.includes('routedQuickActionDuringLaunch')) {
      const windowProperty = '  var window: UIWindow?\n';
      if (!updated.includes(windowProperty)) {
        throw new Error('Could not find the Expo AppDelegate window property insertion point.');
      }
      updated = updated.replace(windowProperty, `${windowProperty}  private var routedQuickActionDuringLaunch = false\n`);
    }

    if (!updated.includes('performActionFor shortcutItem: UIApplicationShortcutItem')) {
      const linkingMarker = '  // Linking API\n';
      if (!updated.includes(linkingMarker)) {
        throw new Error('Could not find the Expo AppDelegate Linking API insertion point.');
      }
      updated = updated.replace(linkingMarker, `${quickActionHandler}${linkingMarker}`);
    }

    const launchFlag = '    routedQuickActionDuringLaunch = launchOptions?[.shortcutItem] != nil\n';
    const launchOptionsDeclaration = '    var reactLaunchOptions = launchOptions ?? [:]\n';
    if (updated.includes(launchOptionsDeclaration) && !updated.includes(launchFlag)) {
      updated = updated.replace(launchOptionsDeclaration, `${launchOptionsDeclaration}${launchFlag}`);
    }

    config.modResults.contents = updated;
    return config;
  });
}

module.exports = withIosQuickActions;
