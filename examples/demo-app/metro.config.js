const path = require('path');
const { mergeConfig, getDefaultConfig } = require('@react-native/metro-config');
const { createHarmonyMetroConfig } = require('@react-native-oh/react-native-harmony/metro.config');

const repoRoot = path.resolve(__dirname, '../..');

/**
 * The SDK is consumed from source (packages/waypoint-sdk) and the evaluation task
 * list from eval/, so Metro watches the repository root.
 * @type {import("metro-config").MetroConfig}
 */
const config = {
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      'waypoint-sdk': path.resolve(repoRoot, 'packages/waypoint-sdk'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
    // The SDK's own dev dependencies must not shadow the app's React Native.
    blockList: [/packages\/waypoint-sdk\/node_modules\/.*/],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: { experimentalImportSupport: false, inlineRequires: true },
    }),
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  createHarmonyMetroConfig({ reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony' }),
  config,
);
