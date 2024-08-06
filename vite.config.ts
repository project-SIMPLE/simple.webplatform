import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // suppress eslint warning that process isn't defined (it is)
  // eslint-disable-next-line
  const env = {...loadEnv(mode, process.cwd(), 'WEB_APPLICATION_')};
  console.log(`[WEB-APP] loaded env: ${JSON.stringify(env)}`);

  // reusable config for both server and preview
  const serverConfig = {
    host: env.WEB_APPLICATION_HOST,
    port: Number(env.WEB_APPLICATION_PORT),
    strictPort: true,
  };

  return {
    plugins: [react()],
    preview: serverConfig,
    server: serverConfig
  };
})
