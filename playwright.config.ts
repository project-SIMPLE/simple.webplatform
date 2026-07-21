import { defineConfig, devices } from "@playwright/test";

// StaticServer (production mode) serves the built dist on WEB_PORT; MonitorServer
// runs on MONITOR_WS_PORT — which must match the frontend build's default (8001,
// since the E2E build has no .env overriding it).
const WEB_PORT = 8100;
const MONITOR_WS_PORT = 8001;

export default defineConfig({
	testDir: "./test/e2e",
	// full-stack.spec needs a live GAMA server; it only runs under playwright.full.config.ts.
	testIgnore: ["**/full-stack.spec.ts"],
	timeout: 30_000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: `http://127.0.0.1:${WEB_PORT}`,
		headless: true,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	// Boot the REAL backend in production mode: StaticServer serves the built
	// frontend, MonitorServer + ModelManager serve the demo simulation list. GAMA
	// need not run (the tiles simply render disabled).
	webServer: {
		command: "npx tsx src/api/index.ts",
		env: {
			NODE_ENV: "production",
			WEB_APPLICATION_PORT: String(WEB_PORT),
			MONITOR_WS_PORT: String(MONITOR_WS_PORT),
			LEARNING_PACKAGE_PATH: "./learning-packages",
		},
		url: `http://127.0.0.1:${WEB_PORT}`,
		timeout: 60_000,
		reuseExistingServer: false,
		stdout: "pipe",
		stderr: "pipe",
	},
});
