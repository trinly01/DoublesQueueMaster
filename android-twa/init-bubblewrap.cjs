const fs = require('fs');
const path = require('path');
const { TwaManifest, TwaGenerator, JdkHelper, KeyTool, Config, ConsoleLog, BufferedLog } = require('C:/nvm4w/nodejs/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core');
const crypto = require('crypto');

const TARGET_DIR = 'C:/Users/trinm/Documents/GitHub/DoublesQueueMaster/android-twa';
const CONFIG_PATH = 'C:/Users/trinm/.bubblewrap/config.json';
const WEB_MANIFEST_URL = 'https://dinkmatch.club/manifest.json';

const PACKAGE_ID = 'club.dinkmatch.app';
const VERSION_CODE = 1;
const VERSION_NAME = '1.0';
const KEYSTORE_PATH = path.join(TARGET_DIR, 'android.keystore');
const KEY_ALIAS = 'android';
const KEYSTORE_PASSWORD = 'DinkMatch2026!';
const KEY_PASSWORD = 'DinkMatch2026!';

const SIGNER_NAME = 'DinkMatch Admin';
const SIGNER_ORG_UNIT = 'Engineering';
const SIGNER_ORG = 'DinkMatch';
const SIGNER_COUNTRY = 'US';

class MockPrompt {
  async printMessage(msg) { console.log(msg); }
  async promptInput(msg, defaultValue, validate) { return defaultValue; }
  async promptChoice(msg, choices, defaultValue, validate) { return defaultValue; }
  async promptConfirm(msg, defaultValue) { return defaultValue; }
  async promptPassword(msg, validate) { return KEYSTORE_PASSWORD; }
  async downloadFile(url, filename, totalSize) { console.log(`Downloading ${filename}...`); }
}

async function main() {
  const config = await Config.loadConfig(CONFIG_PATH);
  const jdkHelper = new JdkHelper(process, config);
  const keyTool = new KeyTool(jdkHelper);
  const log = new BufferedLog(new ConsoleLog('init'));
  const prompt = new MockPrompt();

  console.log('Fetching web manifest...');
  const twaManifest = await TwaManifest.fromWebManifest(WEB_MANIFEST_URL);

  // Override with desired values
  twaManifest.packageId = PACKAGE_ID;
  twaManifest.appVersionCode = VERSION_CODE;
  twaManifest.appVersionName = VERSION_NAME;
  twaManifest.signingKey = { path: KEYSTORE_PATH, alias: KEY_ALIAS };
  twaManifest.generatorApp = 'bubblewrap';

  // Ensure target directory exists
  await fs.promises.mkdir(TARGET_DIR, { recursive: true });

  const manifestFile = path.join(TARGET_DIR, 'twa-manifest.json');
  await twaManifest.saveToFile(manifestFile);
  console.log('Saved twa-manifest.json');

  // Generate TWA project
  console.log('Generating Android project...');
  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(TARGET_DIR, twaManifest, log);
  log.flush();
  console.log('Project generated.');

  // Generate checksum
  const manifestContents = await fs.promises.readFile(manifestFile);
  const checksum = crypto.createHash('sha1').update(manifestContents).digest('hex');
  await fs.promises.writeFile(path.join(TARGET_DIR, 'manifest-checksum.txt'), checksum);
  console.log('Generated manifest-checksum.txt');

  // Create signing key
  if (!fs.existsSync(KEYSTORE_PATH)) {
    console.log('Creating signing key...');
    await keyTool.createSigningKey({
      fullName: SIGNER_NAME,
      organizationalUnit: SIGNER_ORG_UNIT,
      organization: SIGNER_ORG,
      country: SIGNER_COUNTRY,
      password: KEYSTORE_PASSWORD,
      keypassword: KEY_PASSWORD,
      alias: KEY_ALIAS,
      path: KEYSTORE_PATH,
    });
    console.log('Signing key created.');
  } else {
    console.log('Signing key already exists.');
  }

  // Save key info
  const keyInfo = [
    'Keep this file and android.keystore in a safe place.',
    '',
    `Key store file: android.keystore`,
    `Key store password: ${KEYSTORE_PASSWORD}`,
    `Key alias: ${KEY_ALIAS}`,
    `Key password: ${KEY_PASSWORD}`,
    `Signer's full name: ${SIGNER_NAME}`,
    `Signer's organization: ${SIGNER_ORG}`,
    `Signer's organizational unit: ${SIGNER_ORG_UNIT}`,
    `Signer's country code: ${SIGNER_COUNTRY}`,
  ].join('\n');
  await fs.promises.writeFile(path.join(TARGET_DIR, 'signing-key-info.txt'), keyInfo);
  console.log('Saved signing-key-info.txt');
  console.log('Done. Run `bubblewrap build` in this folder to create the AAB.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
