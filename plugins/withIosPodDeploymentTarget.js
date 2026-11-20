const { withPodfile } = require('@expo/config-plugins');

const MARKER = '    # Expert AI: align pod deployment targets with the app minimum.';

function withIosPodDeploymentTarget(config) {
  const deploymentTarget = String(config.ios?.deploymentTarget || '16.0');
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes(MARKER)) return config;

    const postInstallClose = /(^  post_install do \|installer\|\n[\s\S]*?^  end$)/m;
    if (!postInstallClose.test(contents)) {
      throw new Error('Could not find the Podfile post_install block for iOS deployment-target alignment.');
    }

    contents = contents.replace(postInstallClose, (block) => `${block.replace(/\n  end$/, '')}
${MARKER}
    minimum_deployment_target = Gem::Version.new('${deploymentTarget}')
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_configuration|
        current_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current_target.nil? || Gem::Version.new(current_target) < minimum_deployment_target
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'
        end
      end
    end
  end`);

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withIosPodDeploymentTarget;
