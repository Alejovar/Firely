import type { CapacitorConfig } from '@capacitor/cli';

const usb = process.env.FIRELY_USB_DEV === '1';
const config: CapacitorConfig = {
  appId: 'org.firely.mobile.main',
  appName: 'Firely Main',
  webDir: 'mobile-dist',
  // Bundle the main frontend. Only the API is remote; never use server.url.
  ...(usb ? { server: { androidScheme: 'http', cleartext: true } } : {}),
};
export default config;
