import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Full-stack end-to-end: the COMPILED binary wired to a real GAMA server and a
// real Android device/emulator. Unlike playwright.sea.config.ts (binary only),
// this boots the platform with GAMA_IP_ADDRESS/GAMA_WS_PORT set and relies on an
// adb server on localhost:5037, so the GAMA-connection, streaming and
// launch-from-browser specs actually run instead of skipping.
//
// Prerequisites (the CI `test-e2e-full` job provides them):
//   - bin/simple-<platform> built (downloaded from the compilation-linux artifact)
//   - a GAMA WebSocket server listening on GAMA_WS_PORT
//   - an Android emulator registered with the adb server on localhost:5037
const WEB_PORT = 8100;
const MONITOR_WS_PORT = 8001;
const GAMA_WS_PORT = process.env.GAMA_WS_PORT ?? "2000";

const BINARY =
	{
		darwin: "./bin/simple-macos",
		win32: "./bin/simple-win.exe",
	}[process.platform as string] ?? "./bin/simple-linux";

if (!existsSync(BINARY)) {
	throw new Error(
		`Compiled binary not found at ${BINARY}. Build it (npm run build:sea:*) or download the CI artifact.`,
	);
}

export default defineConfig({
	testDir: "./test/e2e",
	timeout: 60_000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: `http://127.0.0.1:${WEB_PORT}`,
		headless: true,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: BINARY,
		env: {
			NODE_ENV: "production",
			WEB_APPLICATION_PORT: String(WEB_PORT),
			MONITOR_WS_PORT: String(MONITOR_WS_PORT),
			LEARNING_PACKAGE_PATH: "./learning-packages",
			ENV_GAMALESS: "false",
			// Point the platform at the GAMA server the CI job started.
			GAMA_IP_ADDRESS: process.env.GAMA_IP_ADDRESS ?? "localhost",
			GAMA_WS_PORT,
		},
		url: `http://127.0.0.1:${WEB_PORT}`,
		timeout: 120_000,
		reuseExistingServer: false,
		stdout: "pipe",
		stderr: "pipe",
	},
});
