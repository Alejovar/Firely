import type { CapacitorConfig } from '@capacitor/cli';

// Every build keeps the Glass interface in the APK. USB mode only enables
// local HTTP for the API reached through adb reverse tcp:8080 tcp:8080.
const usb = process.env.FIRELY_USB_DEV === '1';
const config: CapacitorConfig = {
  appId: 'org.firely.mobile',
  appName: 'Firely',
  webDir: 'dist',
  ...(usb ? {
    server: { androidScheme: 'http', cleartext: true },
    android: { webContentsDebuggingEnabled: true },
  } : {}),
};

export default config;
