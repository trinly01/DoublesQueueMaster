const path = require('path');
const {
  Config,
  ConsoleLog,
  JdkHelper,
  AndroidSdkTools,
  GradleWrapper,
  JarSigner,
  TwaManifest,
} = require('C:/nvm4w/nodejs/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core');
const {
  AndroidSdkToolsInstaller,
} = require('C:/nvm4w/nodejs/node_modules/@bubblewrap/cli/dist/lib/AndroidSdkToolsInstaller');
const fs = require('fs');

const TARGET_DIR =
  'C:/Users/trinm/Documents/GitHub/DoublesQueueMaster/android-twa';
const CONFIG_PATH = 'C:/Users/trinm/.bubblewrap/config.json';
const ANDROID_SDK_PATH = 'C:/Users/trinm/.bubblewrap/android-sdk';
const KEYSTORE_PASSWORD = 'DinkMatch2026!';
const KEY_PASSWORD = 'DinkMatch2026!';

const APP_BUNDLE_BUILD_OUTPUT = path.join(
  TARGET_DIR,
  'app/build/outputs/bundle/release/app-release.aab',
);
const APP_BUNDLE_SIGNED = path.join(TARGET_DIR, 'app-release-bundle.aab');

class MockPrompt {
  async printMessage(message) {
    console.log(message);
  }
  async promptInput(_message, defaultValue) {
    return defaultValue;
  }
  async promptChoice(_message, _choices, defaultValue) {
    return defaultValue;
  }
  async promptConfirm(_message, defaultValue) {
    return defaultValue;
  }
  async promptPassword() {
    return KEYSTORE_PASSWORD;
  }
  async downloadFile(url, filename) {
    console.log(`Downloading ${path.basename(filename)}...`);
    await require('C:/nvm4w/nodejs/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core').fetchUtils.downloadFile(
      url,
      filename,
      (current, total) => {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        if (pct % 10 === 0) console.log(`  ${pct}%`);
      },
    );
  }
}

async function main() {
  const log = new ConsoleLog('build');
  const prompt = new MockPrompt();

  // Load or create config
  let config = await Config.loadConfig(CONFIG_PATH);
  if (!config) {
    config = new Config('', '');
  }

  // Install JDK if needed
  const jdkPath = 'C:/Users/trinm/.bubblewrap/jdk/jdk-17.0.11+9';
  process.env.JAVA_HOME = jdkPath;
  process.env.PATH = `${jdkPath}\\bin;${process.env.PATH}`;
  config = new Config(jdkPath, config.androidSdkPath);
  await config.saveConfig(CONFIG_PATH);

  // Install Android SDK if needed
  if (
    !fs.existsSync(ANDROID_SDK_PATH) ||
    (!fs.existsSync(path.join(ANDROID_SDK_PATH, 'cmdline-tools')) &&
      !fs.existsSync(path.join(ANDROID_SDK_PATH, 'tools')))
  ) {
    console.log('Installing Android SDK...');
    await fs.promises.mkdir(ANDROID_SDK_PATH, { recursive: true });
    const installer = new AndroidSdkToolsInstaller(process, prompt);
    await installer.install(ANDROID_SDK_PATH);
    config = new Config(jdkPath, ANDROID_SDK_PATH);
    await config.saveConfig(CONFIG_PATH);
    console.log('Android SDK installed.');
  } else {
    console.log('Android SDK already exists.');
    config = new Config(jdkPath, ANDROID_SDK_PATH);
    await config.saveConfig(CONFIG_PATH);
  }

  const jdkHelper = new JdkHelper(process, config);
  const androidSdkTools = await AndroidSdkTools.create(
    process,
    config,
    jdkHelper,
    log,
  );

  // Install build tools if needed
  if (!(await androidSdkTools.checkBuildTools())) {
    console.log('Installing Android Build Tools...');
    await androidSdkTools.installBuildTools();
  }

  const manifestFile = path.join(TARGET_DIR, 'twa-manifest.json');
  const twaManifest = await TwaManifest.fromFile(manifestFile);
  const signingKey = twaManifest.signingKey;
  const gradleWrapper = new GradleWrapper(process, androidSdkTools);
  const jarSigner = new JarSigner(jdkHelper);

  // Build APK
  console.log('Building APK...');
  await gradleWrapper.assembleRelease();

  // Build AAB
  console.log('Building App Bundle...');
  await gradleWrapper.bundleRelease();

  // Sign AAB
  console.log('Signing App Bundle...');
  await jarSigner.sign(
    signingKey,
    `"${KEYSTORE_PASSWORD}"`,
    `"${KEY_PASSWORD}"`,
    APP_BUNDLE_BUILD_OUTPUT,
    APP_BUNDLE_SIGNED,
  );

  console.log('Done. Signed AAB:');
  console.log(APP_BUNDLE_SIGNED);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
