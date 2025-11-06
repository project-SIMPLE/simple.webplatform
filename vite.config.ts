import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // suppress eslint warning that process isn't defined (it is)
  // eslint-disable-next-line
  const env = { ...loadEnv(mode, process.cwd(), '') };
  if(env.EXTRA_VERBOSE === 'true') {
    console.log(`[WEB-APP] loaded env: ${JSON.stringify(env)}`);
  }

  // reusable config for both server and preview
  const serverConfig = {
    host: env.WEB_APPLICATION_HOST || '0.0.0.0',
    port: Number(env.WEB_APPLICATION_PORT),
    strictPort: true,
    allowedHosts: ["simple.local", env.WEB_HOSTNAME+".local"],
  };

  return {
    plugins: [react()],
    preview: serverConfig,
    server: serverConfig,
    optimizeDeps: {
      exclude: ["@yume-chan/adb-scrcpy", "@yume-chan/stream-extra", "@yume-chan/scrcpy-decoder-tinyh264"],
      include: ['@yume-chan/scrcpy-decoder-tinyh264 > yuv-buffer', '@yume-chan/scrcpy-decoder-tinyh264 > yuv-canvas']
    },
    define: {
      'process.env.MONITOR_WS_PORT': JSON.stringify(env.MONITOR_WS_PORT),
      'process.env.HEADSETS_IP' : JSON.stringify(env.HEADSETS_IP),
    }
  };
})
