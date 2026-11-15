import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || resolve(homedir(), 'Android/Sdk');
const executable = process.platform === 'win32' ? 'adb.exe' : 'adb';
const candidate = resolve(sdk, 'platform-tools', executable);
const adb = existsSync(candidate) ? candidate : executable;
const serial = process.env.ANDROID_SERIAL;

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
const deviceArgs = serial ? ['-s', serial] : [];

try {
  for (const path of ['/', '/api/openapi.json']) {
    const response = await fetch(`http://localhost:8080${path}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    await response.body?.cancel();
  }
} catch (error) {
  console.error('La web/API no responde en localhost:8080. Desde la raíz ejecuta: docker compose up -d --build api web');
  console.error(error.message);
  process.exit(1);
}

run(adb, [...deviceArgs, 'get-state']);
run(adb, [...deviceArgs, 'reverse', 'tcp:8080', 'tcp:8080']);
run('npm', ['run', 'apk'], { ...process.env, FIRELY_USB_DEV: '1', VITE_API_URL: 'http://localhost:8080/api' });
run(adb, [...deviceArgs, 'install', '-r', resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk')]);
// Reload the app even if an old activity was already open before installation.
run(adb, [...deviceArgs, 'shell', 'am', 'force-stop', 'org.firely.mobile']);
run(adb, [...deviceArgs, 'shell', 'am', 'start', '-W', '-n', 'org.firely.mobile/.MainActivity']);
console.log('Firely Glass instalada; API por USB: http://localhost:8080/api');
