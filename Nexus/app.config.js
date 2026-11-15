const { validateOnlineBuild } = require('./config/previewBuild');

module.exports = ({ config }) => {
  if (process.env.NEXUS_ONLINE_BUILD === '1' || ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE)) {
    validateOnlineBuild(process.env);
  }
  // Keep the existing applicationId, permissions, plugins and EAS project. Never
  // spread process.env into extra: only EXPO_PUBLIC values are inlined by Metro.
  return config;
};
