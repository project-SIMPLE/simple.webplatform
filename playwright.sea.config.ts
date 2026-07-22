import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Same end-to-end specs as playwright.config.ts, but driven against the COMPILED
// single-executable (SEA) build instead of `tsx src/api/index.ts`. This validates
// the real packaged artifact — the embedded frontend (dist/), uWebSockets.js and
// node-hid native bindings, and bundled toolkit assets — not just the dev source.
//
// Build the binary first: `npm run build:sea:{linux,macos,win}`. The binary bakes
// the frontend at build time with the default MONITOR_WS_PORT (8001), so the
// monitor server must run on 8001 here; the HTTP port is set at runtime.
const WEB_PORT = 8100;
const MONITOR_WS_PORT = 8001;

// Absolute path so the webServer command launches under any shell (Windows cmd
// doesn't accept the "./" prefix).
const BINARY = path.resolve(
	{
		darwin: "./bin/simple-macos",
		win32: "./bin/simple-win.exe",
	}[process.platform as string] ?? "./bin/simple-linux",
);

if (!existsSync(BINARY)) {
	throw new Error(
		`Compiled binary not found at ${BINARY}. Build it first with \`npm run build:sea:${
			process.platform === "darwin" ? "macos" : process.platform === "win32" ? "win" : "linux"
		}\`.`,
	);
}

export default defineConfig({
	testDir: "./test/e2e",
	// full-stack.spec needs a live GAMA server; it only runs under playwright.full.config.ts.
	testIgnore: ["**/full-stack.spec.ts", "**/player-forward.spec.ts"],
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
	// Boot the compiled binary. As a SEA build it auto-starts the StaticServer
	// (IS_PLATFORM_PACKAGED) and serves the embedded frontend + demo simulation list.
	webServer: {
		command: BINARY,
		env: {
			NODE_ENV: "production",
			WEB_APPLICATION_PORT: String(WEB_PORT),
			MONITOR_WS_PORT: String(MONITOR_WS_PORT),
			LEARNING_PACKAGE_PATH: "./learning-packages",
			// The packaged binary defaults to GAMALESS mode on a non-interactive
			// first run (unlike the dev `tsx` path). Force it off so the model
			// manager loads and serves the demo simulation list under test.
			ENV_GAMALESS: "false",
		},
		url: `http://127.0.0.1:${WEB_PORT}`,
		timeout: 120_000,
		reuseExistingServer: false,
		stdout: "pipe",
		stderr: "pipe",
	},
});
