import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';

/**
 * This computer's address on the local network (e.g. 192.168.1.20), so invite
 * links made while hosting from http://localhost work for friends on the same Wi-Fi.
 */
function lanAddress(): string {
  // Virtual adapters (VMs, WSL, Docker, VPNs) aren't reachable from friends' devices
  const VIRTUAL = /vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|vmnet|loopback|tailscale|zerotier|bluetooth/i;
  const PHYSICAL = /wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d|^wl/i;
  const candidates: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !VIRTUAL.test(name)) candidates.push({ name, address: net.address });
    }
  }
  const privateRange = (a: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  const best =
    candidates.find((c) => PHYSICAL.test(c.name) && privateRange(c.address)) ??
    candidates.find((c) => privateRange(c.address)) ??
    candidates[0];
  return best?.address ?? '';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __LAN_HOST__: JSON.stringify(lanAddress()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
