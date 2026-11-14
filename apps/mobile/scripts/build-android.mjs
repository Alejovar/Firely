import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const android = fileURLToPath(new URL('../android/', import.meta.url));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || [
  resolve(homedir(), 'Android/Sdk'),
  resolve(homedir(), 'Library/Android/sdk'),
  resolve(process.env.LOCALAPPDATA || resolve(homedir(), 'AppData/Local'), 'Android/Sdk'),
].find(existsSync);

if (!sdk) {
  console.error('No se encontró el SDK de Android. Configura ANDROID_HOME y vuelve a ejecutar npm run apk.');
  process.exit(1);
}
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain'], {
  cwd: android,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
});
if (result.error) console.error(result.error.message);
if (result.status === 0) console.log(`APK generado: ${resolve(android, 'app/build/outputs/apk/debug/app-debug.apk')}`);
process.exit(result.status ?? 1);
