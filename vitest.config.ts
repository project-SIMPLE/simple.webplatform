import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Frontend components read a handful of build-time `process.env.*` values that
// vite.config.ts injects via `define`. Mirror them here so component tests see
// the same (stubbed) values instead of `undefined`.
// MONITOR_WS_PORT is a build-time define, so the WebSocketManager<->real-backend
// test starts its MonitorServer on this exact (dedicated, uncommon) port.
export const FRONTEND_MONITOR_WS_PORT = "8991";

const frontendDefine = {
	"process.env.MONITOR_WS_PORT": JSON.stringify(FRONTEND_MONITOR_WS_PORT),
	"process.env.HEADSETS_IP": JSON.stringify(""),
	"process.env.ENV_MAX_ELEMENTS": JSON.stringify(""),
	"process.env.IMAGE_SOURCE_FOLDER": JSON.stringify(""),
};

export default defineConfig({
	test: {
		// One runner, three isolated projects. `npm run test:unit` runs the first
		// two (offline, no hardware); `test:integration` runs the last (needs a
		// live GAMA server and is auto-skipped when none is reachable).
		projects: [
			{
				test: {
					name: "unit",
					environment: "node",
					include: ["src/api/**/*.test.ts", "src/common/**/*.test.ts"],
				},
			},
			{
				plugins: [react()],
				define: frontendDefine,
				test: {
					name: "frontend",
					environment: "jsdom",
					globals: true,
					setupFiles: ["./test/setup/frontend.ts"],
					include: ["src/{components,hooks,languages,i18next}/**/*.test.{ts,tsx}"],
				},
			},
			{
				test: {
					name: "integration",
					environment: "node",
					setupFiles: ["dotenv/config"],
					include: ["test/integration/**/*.test.ts"],
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
			},
			{
				test: {
					name: "adb",
					environment: "node",
					include: ["test/adb/**/*.test.ts"],
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
			},
			{
				// Real local uWS servers + real ws clients. Hermetic (localhost only,
				// ephemeral ports) — runs in the fast CI lane alongside unit/frontend.
				test: {
					name: "server",
					environment: "node",
					include: ["test/server/**/*.test.ts"],
					testTimeout: 15_000,
					hookTimeout: 15_000,
				},
			},
		],
		coverage: {
			provider: "v8",
			reportsDirectory: "./coverage",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/main.tsx", "src/workers/**", "test/**"],
		},
	},
});
