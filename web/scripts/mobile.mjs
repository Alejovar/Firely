import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const web = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2] || 'apk';
if (!['build', 'sync', 'apk', 'usb'].includes(action)) throw new Error('Acción móvil desconocida.');
const usb = action === 'usb';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || resolve(homedir(), 'Android/Sdk');
const env = { ...process.env, VITE_NATIVE_APP: '1', VITE_USB_DEV: usb ? '1' : '0', FIRELY_USB_DEV: usb ? '1' : '0',
  ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
if (usb) env.VITE_API_URL = process.env.FIRELY_USB_API_URL || 'http://localhost:8081/api';

function run(command, args, cwd = web) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build', '--', '--outDir', 'mobile-dist']);
if (action === 'build') process.exit(0);
if (!existsSync(resolve(web, 'android'))) run('npx', ['cap', 'add', 'android']);
run('npx', ['cap', 'sync', 'android']);
if (action === 'sync') process.exit(0);
if (!existsSync(sdk)) throw new Error('No se encontró Android SDK. Configura ANDROID_HOME.');
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain'], resolve(web, 'android'));
const apk = resolve(web, 'android/app/build/outputs/apk/debug/app-debug.apk');
console.log(`APK: ${apk}`);
if (usb) {
  const url = new URL(env.VITE_API_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('El modo USB necesita una API HTTP local.');
  const port = url.port || '80';
  const response = await fetch(`${env.VITE_API_URL}/openapi.json`, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`API USB: HTTP ${response.status}`);
  const adb = resolve(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  run(adb, ['reverse', `tcp:${port}`, `tcp:${port}`]);
  run(adb, ['install', '-r', apk]);
  run(adb, ['shell', 'am', 'start', '-n', 'org.firely.mobile.main/.MainActivity']);
}
